import { SagaIterator } from 'redux-saga';
import { call, put, race, select } from 'redux-saga/effects';
import { Context, findDeclaration, parseError, resume, runInContext } from 'x-slang';
import { parse } from 'x-slang/dist/parser/parser';
import { typeCheck } from 'x-slang/dist/typeChecker/typeChecker';
import { Variant } from 'x-slang/dist/types';
import { validateAndAnnotate } from 'x-slang/dist/validator/validator';

import { OverallState, styliseSublanguage } from '../application/ApplicationTypes';
import { DEBUG_RESET, DEBUG_RESUME, HIGHLIGHT_LINE } from '../application/types/InterpreterTypes';
import { Documentation } from '../documentation/Documentation';
import { actions } from '../utils/ActionsHelper';
import { showSuccessMessage, showWarningMessage } from '../utils/NotificationsHelper';
import {
  getBlockExtraMethodsString,
  getDifferenceInMethods,
  getRestoreExtraMethodsString,
  getStoreExtraMethodsString,
  highlightLine,
  inspectorUpdate,
  makeElevatedContext,
  visualiseEnv
} from '../utils/XSlangHelper';
import { notifyProgramEvaluated } from '../workspace/WorkspaceActions';
import {
  EVAL_EDITOR,
  EVAL_REPL,
  EVAL_SILENT,
  NAV_DECLARATION,
  PROMPT_AUTOCOMPLETE,
  TOGGLE_EDITOR_AUTORUN,
  UPDATE_EDITOR_BREAKPOINTS,
  VARIANT_SELECT,
  WorkspaceLocation
} from '../workspace/WorkspaceTypes';
import { safeTakeEvery as takeEvery } from './SafeEffects';

let breakpoints: string[] = [];
export default function* WorkspaceSaga(): SagaIterator {
  let context: Context;

  yield takeEvery(EVAL_EDITOR, function* (action: ReturnType<typeof actions.evalEditor>) {
    const workspaceLocation = action.payload.workspaceLocation;
    const [prepend, editorCode, execTime]: [
      string,
      string,
      number
    ] = yield select((state: OverallState) => [
      state.workspaces[workspaceLocation].editorPrepend,
      state.workspaces[workspaceLocation].editorValue!,
      state.workspaces[workspaceLocation].execTime
    ]);
    // End any code that is running right now.
    yield put(actions.beginInterruptExecution(workspaceLocation));
    // Clear the context, with the same externalSymbols as before.
    // yield put(actions.beginClearContext(workspaceLocation, false));
    yield put(actions.clearReplOutput(workspaceLocation));

    // Refresh context
    yield put(actions.refreshContext(workspaceLocation));
    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);


    let value = editorCode;
    // Check for initial syntax errors. If there are errors, we continue with
    // eval and let it print the error messages.
    parse(value, context);

    if (!context.errors.length) {
      // Otherwise we step through the breakpoints one by one and check them.
      const exploded = editorCode.split('\n');
      for (const b in breakpoints) {
        if (typeof b !== 'string') {
          continue;
        }

        const index: number = +b;
        context.errors = [];
        exploded[index] = 'debugger;' + exploded[index];
        value = exploded.join('\n');
        parse(value, context);

        if (context.errors.length) {
          const msg = 'Hint: Misplaced breakpoint at line ' + (index + 1) + '.';
          yield put(actions.sendReplInputToOutput(msg, workspaceLocation));
        }
      }
    }

    // Evaluate the prepend silently with a privileged context, if it exists
    if (prepend.length) {
      const elevatedContext = makeElevatedContext(context);
      yield call(evalCode, prepend, elevatedContext, execTime, workspaceLocation, EVAL_SILENT);
      // Block use of methods from privileged context
      yield* blockExtraMethods(elevatedContext, context, execTime, workspaceLocation);
    }


    yield call(evalCode, value, context, execTime, workspaceLocation, EVAL_EDITOR);
  });

  yield takeEvery(PROMPT_AUTOCOMPLETE, function* (
    action: ReturnType<typeof actions.promptAutocomplete>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;

    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);

    const [editorNames, displaySuggestions] = [[], []];

    if (!displaySuggestions) {
      yield call(action.payload.callback);
      return;
    }

    const editorSuggestions = editorNames.map((name: any) => ({
      caption: name.name,
      value: name.name,
      meta: name.meta,
      score: name.score ? name.score + 1000 : 1000 // Prioritize suggestions from code
    }));

    const variantName = context.variant.toString();

    const builtinSuggestions = Documentation.builtins[variantName] || [];

    yield call(action.payload.callback, null, editorSuggestions.concat(builtinSuggestions));
  });

  yield takeEvery(TOGGLE_EDITOR_AUTORUN, function* (
    action: ReturnType<typeof actions.toggleEditorAutorun>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const isEditorAutorun = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].isEditorAutorun
    );
    yield call(showWarningMessage, 'Autorun ' + (isEditorAutorun ? 'Started' : 'Stopped'), 750);
  });

  yield takeEvery(EVAL_REPL, function* (action: ReturnType<typeof actions.evalRepl>) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].replValue
    );
    const execTime: number = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].execTime
    );
    yield put(actions.beginInterruptExecution(workspaceLocation));
    yield put(actions.clearReplInput(workspaceLocation));
    yield put(actions.sendReplInputToOutput(code, workspaceLocation));
    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);
    yield call(evalCode, code, context, execTime, workspaceLocation, EVAL_REPL);
  });

  yield takeEvery(DEBUG_RESUME, function* (action: ReturnType<typeof actions.debuggerResume>) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].editorValue
    );
    const execTime: number = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].execTime
    );
    yield put(actions.beginInterruptExecution(workspaceLocation));
    /** Clear the context, with the same chapter and externalSymbols as before. */
    yield put(actions.clearReplOutput(workspaceLocation));
    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);
    yield put(actions.highlightEditorLine([], workspaceLocation));
    yield call(evalCode, code, context, execTime, workspaceLocation, DEBUG_RESUME);
  });

  yield takeEvery(DEBUG_RESET, function* (action: ReturnType<typeof actions.debuggerReset>) {
    const workspaceLocation = action.payload.workspaceLocation;
    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);
    yield put(actions.clearReplOutput(workspaceLocation));
    inspectorUpdate(undefined);
    highlightLine(undefined);
    yield put(actions.clearReplOutput(workspaceLocation));
    lastDebuggerResult = undefined;
  });

  yield takeEvery(HIGHLIGHT_LINE, function* (
    action: ReturnType<typeof actions.highlightEditorLine>
  ) {
    const workspaceLocation = action.payload.highlightedLines;
    highlightLine(workspaceLocation[0]);
    yield;
  });

  yield takeEvery(UPDATE_EDITOR_BREAKPOINTS, function* (
    action: ReturnType<typeof actions.setEditorBreakpoint>
  ) {
    breakpoints = action.payload.breakpoints;
    yield;
  });

  yield takeEvery(VARIANT_SELECT, function* (action: ReturnType<typeof actions.variantSelect>) {
    const { workspaceLocation, variant: newVariant } = action.payload;
    const result: [
      Variant,
      string[],
      Array<[string, any]>
    ] = yield select((state: OverallState) => [
      state.workspaces[workspaceLocation].context.variant,
      state.workspaces[workspaceLocation].context.externalSymbols,
      state.workspaces[workspaceLocation].globals
    ]);
    const oldVariant = result[0];
    if (newVariant !== oldVariant) {
      // yield put(actions.beginClearContext(workspaceLocation, false));
      yield put(actions.clearReplOutput(workspaceLocation));
      yield put(actions.debuggerReset(workspaceLocation));
      yield call(showSuccessMessage, `Switched to ${styliseSublanguage(newVariant)}`, 1000);
    }
  });

  yield takeEvery(NAV_DECLARATION, function* (
    action: ReturnType<typeof actions.navigateToDeclaration>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select(
      (state: OverallState) => state.workspaces[workspaceLocation].editorValue
    );
    context = yield select((state: OverallState) => state.workspaces[workspaceLocation].context);

    const result = findDeclaration(code, context, {
      line: action.payload.cursorPosition.row + 1,
      column: action.payload.cursorPosition.column
    });

    if (result) {
      yield put(
        actions.moveCursor(action.payload.workspaceLocation, {
          row: result.start.line - 1,
          column: result.start.column
        })
      );
    }
  });
}

let lastDebuggerResult: any;
function* updateInspector(workspaceLocation: WorkspaceLocation): SagaIterator {
  try {
    const start = lastDebuggerResult.context.runtime.nodes[0].loc.start.line - 1;
    const end = lastDebuggerResult.context.runtime.nodes[0].loc.end.line - 1;
    yield put(actions.highlightEditorLine([start, end], workspaceLocation));
    inspectorUpdate(lastDebuggerResult);
    visualiseEnv(lastDebuggerResult);
  } catch (e) {
    yield put(actions.highlightEditorLine([], workspaceLocation));
    // most likely harmless, we can pretty much ignore this.
    // half of the time this comes from execution ending or a stack overflow and
    // the context goes missing.
  }
}

export function* blockExtraMethods(
  elevatedContext: Context,
  context: Context,
  execTime: number,
  workspaceLocation: WorkspaceLocation,
  unblockKey?: string
) {
  // Extract additional methods available in the elevated context relative to the context
  const toBeBlocked = getDifferenceInMethods(elevatedContext, context);
  if (unblockKey) {
    const storeValues = getStoreExtraMethodsString(toBeBlocked, unblockKey);
    yield call(evalCode, storeValues, elevatedContext, execTime, workspaceLocation, EVAL_SILENT);
  }

  const nullifier = getBlockExtraMethodsString(toBeBlocked);
  yield call(evalCode, nullifier, elevatedContext, execTime, workspaceLocation, EVAL_SILENT);
}

export function* restoreExtraMethods(
  elevatedContext: Context,
  context: Context,
  execTime: number,
  workspaceLocation: WorkspaceLocation,
  unblockKey: string
) {
  const toUnblock = getDifferenceInMethods(elevatedContext, context);
  const restorer = getRestoreExtraMethodsString(toUnblock, unblockKey);
  yield call(evalCode, restorer, elevatedContext, execTime, workspaceLocation, EVAL_SILENT);
}

export function* evalCode(
  code: string,
  context: Context,
  execTime: number,
  workspaceLocation: WorkspaceLocation,
  actionType: string
): SagaIterator {
  const stepLimit: number = yield select(
    (state: OverallState) => state.workspaces[workspaceLocation].stepLimit
  );


  // const substActiveAndCorrectChapter = workspaceLocation === 'playground';
  // if (substActiveAndCorrectVariant) {
  //   context.executionMethod = 'interpreter';
  // }

  function call_variant(variant: Variant) {
    if (variant === 'cont') {
      return call(runInContext, code, context, {
        scheduler: 'preemptive',
        originalMaxExecTime: execTime,
        stepLimit: stepLimit
      });
    } else {
      throw new Error('Unknown variant: ' + variant);
    }
  }

  const { result } = yield race({
    result:
      actionType === DEBUG_RESUME ? call(resume, lastDebuggerResult) : call_variant(context.variant)
  });

  if (actionType === EVAL_EDITOR) {
    lastDebuggerResult = result;
  }
  yield call(updateInspector, workspaceLocation);

  if (
    result.status !== 'suspended' &&
    result.status !== 'finished' &&
    result.status !== 'suspended-non-det'
  ) {
    yield put(actions.evalInterpreterError(context.errors, workspaceLocation));

    // we need to parse again, but preserve the errors in context
    const oldErrors = context.errors;
    context.errors = [];
    const parsed = parse(code, context);
    const typeErrors = parsed && typeCheck(validateAndAnnotate(parsed!, context), context)[1];

    context.errors = oldErrors;

    if (typeErrors && typeErrors.length > 0) {
      yield put(
        actions.sendReplInputToOutput('Hints:\n' + parseError(typeErrors), workspaceLocation)
      );
    }
    return;
  } else if (result.status === 'suspended') {
    yield put(actions.endDebuggerPause(workspaceLocation));
    yield put(actions.evalInterpreterSuccess('Breakpoint hit!', workspaceLocation));
    return;
  }

  // Do not write interpreter output to REPL, if executing chunks (e.g. prepend/postpend blocks)
  if (actionType !== EVAL_SILENT) {
    yield put(actions.evalInterpreterSuccess(result.value, workspaceLocation));
  }

  // For EVAL_EDITOR and EVAL_REPL, we send notification to workspace that a program has been evaluated
  if (actionType === EVAL_EDITOR || actionType === EVAL_REPL) {
    yield put(notifyProgramEvaluated(result, lastDebuggerResult, code, context, workspaceLocation));
  }
}
