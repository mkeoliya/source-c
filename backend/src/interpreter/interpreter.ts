/* tslint:disable:max-classes-per-file */
import * as es from 'estree'
import * as errors from '../errors/errors'
import { RuntimeSourceError } from '../errors/runtimeSourceError'
import { checkForStackOverflow } from '../schedulers'
import {
  BinBothCont,
  BinRightCont,
  CallExprCont,
  CapturedContinuation,
  Context,
  Continuation,
  Environment,
  ExecCont,
  FnArgCont,
  FnEvalCont,
  UnArgCont,
  Value,
  VarDecCont,
  CEKLiteral,
  CEKExpr,
  isCEKLiteral,
  isEmptyCont,
  isCapturedCont,
  Frame,
  IfCont,
  DelimCont,
  AssignCont,
  Result
} from '../types'
import { conditionalExpression, literal, primitive, callExpression } from '../utils/astCreator'
import { evaluateBinaryExpression, evaluateUnaryExpression } from '../utils/operators'
import * as rttc from '../utils/rttc'
import Closure from './closure'

const RETURN_CONTINUATION = '**return_cont**'

const createEnvironment = (
  closure: Closure,
  args: Value[],
  callExpression?: es.CallExpression
): Environment => {
  const environment: Environment = {
    name: closure.functionName, // TODO: Change this
    tail: closure.environment,
    head: {}
  }
  if (callExpression) {
    environment.callExpression = {
      ...callExpression,
      arguments: args.map(primitive)
    }
  }
  closure.node.params.forEach((param, index) => {
    if (param.type === 'RestElement') {
      environment.head[(param.argument as es.Identifier).name] = args.slice(index)
    } else {
      environment.head[(param as es.Identifier).name] = args[index]
    }
  })
  return environment
}

const handleRuntimeError = (context: Context, error: RuntimeSourceError): never => {
  context.errors.push(error)
  context.runtime.environments = context.runtime.environments.slice(
    -context.numberOfOuterEnvironments
  )
  throw error
}

const DECLARED_BUT_NOT_YET_ASSIGNED = Symbol('Used to implement hoisting')

function declareIdentifier(context: Context, name: string, node: es.Node) {
  const environment = currentEnvironment(context)
  if (environment.head.hasOwnProperty(name)) {
    const descriptors = Object.getOwnPropertyDescriptors(environment.head)

    return handleRuntimeError(
      context,
      new errors.VariableRedeclaration(node, name, descriptors[name].writable)
    )
  }
  environment.head[name] = DECLARED_BUT_NOT_YET_ASSIGNED
  return environment
}

function declareVariables(context: Context, node: es.VariableDeclaration) {
  for (const declaration of node.declarations) {
    declareIdentifier(context, (declaration.id as es.Identifier).name, node)
  }
}

function declareFunctionsAndVariables(context: Context, node: es.BlockStatement) {
  for (const statement of node.body) {
    switch (statement.type) {
      case 'VariableDeclaration':
        declareVariables(context, statement)
        break
      case 'FunctionDeclaration':
        declareIdentifier(context, (statement.id as es.Identifier).name, statement)
        break
    }
  }
}

function checkIfDeclared(context: Context, name: string, constant = false) {
  const environment = currentEnvironment(context)

  if (environment.head[name] !== DECLARED_BUT_NOT_YET_ASSIGNED) {
    return handleRuntimeError(
      context,
      new errors.VariableRedeclaration(context.runtime.nodes[0]!, name, !constant)
    )
  }
  return
}

function defineVariable(context: Context, name: string, value: Value, constant = false) {
  const environment = currentEnvironment(context)

  Object.defineProperty(environment.head, name, {
    value,
    writable: !constant,
    enumerable: true
  })

  return environment
}

const currentEnvironment = (context: Context) => context.runtime.environments[0]
const replaceEnvironment = (context: Context, environment: Environment) => {
  context.runtime.environments[0] = environment
}
const pushEnvironment = (context: Context, name: string) => {
  const newEnv = pushFrame(currentEnvironment(context), name)
  replaceEnvironment(context, newEnv)
}

const pushFrame = (environment: Environment, name: string) => {
  const newFrame: Frame = {}
  const newEnv: Environment = {
    name,
    tail: environment,
    head: newFrame
  }
  return newEnv
}

const getVariable = (context: Context, name: string) => {
  let environment: Environment | null = currentEnvironment(context)
  while (environment) {
    if (environment.head.hasOwnProperty(name)) {
      if (environment.head[name] === DECLARED_BUT_NOT_YET_ASSIGNED) {
        return handleRuntimeError(
          context,
          new errors.UnassignedVariable(name, context.runtime.nodes[0])
        )
      } else {
        return environment.head[name]
      }
    } else {
      environment = environment.tail
    }
  }
  return handleRuntimeError(context, new errors.UndefinedVariable(name, context.runtime.nodes[0]))
}

const setVariable = (context: Context, name: string, value: any) => {
  let environment: Environment | null = currentEnvironment(context)
  while (environment) {
    if (environment.head.hasOwnProperty(name)) {
      if (environment.head[name] === DECLARED_BUT_NOT_YET_ASSIGNED) {
        break
      }
      const descriptors = Object.getOwnPropertyDescriptors(environment.head)
      if (descriptors[name].writable) {
        environment.head[name] = value
        return undefined
      }
      return handleRuntimeError(
        context,
        new errors.ConstAssignment(context.runtime.nodes[0]!, name)
      )
    } else {
      environment = environment.tail
    }
  }
  return handleRuntimeError(context, new errors.UndefinedVariable(name, context.runtime.nodes[0]))
}

function transformLogicalExpression(node: es.LogicalExpression): es.ConditionalExpression {
  if (node.operator === '&&') {
    return conditionalExpression(node.left, node.right, literal(false), node.loc!)
  } else {
    return conditionalExpression(node.left, literal(true), node.right, node.loc!)
  }
}

const checkNumberOfArguments = (
  context: Context,
  callee: Closure | Value,
  args: Value[],
  exp: es.CallExpression
) => {
  if (callee instanceof Closure) {
    const params = callee.node.params
    const hasVarArgs = params[params.length - 1]?.type === 'RestElement'
    if (hasVarArgs ? params.length - 1 > args.length : params.length !== args.length) {
      return handleRuntimeError(
        context,
        new errors.InvalidNumberOfArguments(
          exp,
          hasVarArgs ? params.length - 1 : params.length,
          args.length
        )
      )
    }
  } else if (isCapturedCont(callee)) {
    if (args.length !== 1) {
      return handleRuntimeError(context, new errors.InvalidNumberOfArguments(exp, 1, args.length))
    }
  } else {
    const hasVarArgs = callee.minArgsNeeded != undefined
    if (hasVarArgs ? callee.minArgsNeeded > args.length : callee.length !== args.length) {
      return handleRuntimeError(
        context,
        new errors.InvalidNumberOfArguments(
          exp,
          hasVarArgs ? callee.minArgsNeeded : callee.length,
          args.length
        )
      )
    }
  }
  return undefined
}

// Manipulating continuation stack
const getCont = (context: Context) => context.runtime.continuations[0]
const getAllConts = (context: Context) => context.runtime.continuations
const pushCont = (context: Context, cont: Continuation) =>
  context.runtime.continuations.unshift(cont)
const popCont = (context: Context): Continuation =>
  context.runtime.continuations.shift() ||
  handleRuntimeError(context, new errors.InvalidContinuationStack())
const replaceConts = (context: Context, cs: Continuation[]) => (context.runtime.continuations = cs)

// Switch to the environment that the continuation should be run in
const switchToContEnv = (context: Context, cont: Continuation) => {
  if (cont.type !== 'empty' && cont.type !== 'delim') replaceEnvironment(context, cont.env)
}

// Handlers for continuation types

/**
 * Once the current arg has been evaluated to a basic type (literal/function expr/etc),
 * move on to the next arg / move on to the FnEvalCont as needed.
 * */
const handleFnArgCont = (context: Context, cont: FnArgCont, val: CEKLiteral): [Value, Context] => {
  if (cont.remainingArgs.length === 0) {
    const newCont: FnEvalCont = {
      type: 'fn-eval',
      args: [...cont.evaluatedArgs, val],
      func: cont.func,
      callExpr: cont.callExpr,
      env: currentEnvironment(context)
    }

    pushCont(context, newCont)
    return [cont.func, context]
  } else {
    const newNode = cont.remainingArgs.shift()
    const newCont: FnArgCont = {
      type: 'fn-arg',
      callExpr: cont.callExpr,
      remainingArgs: [...cont.remainingArgs],
      evaluatedArgs: [...cont.evaluatedArgs, val],
      func: cont.func,
      env: currentEnvironment(context)
    }
    pushCont(context, newCont)
    return [newNode, context]
  }
}

const handleVarDecCont = (context: Context, cont: VarDecCont, value: any): [Value, Context] => {
  defineVariable(context, cont.identifier.name, value, cont.isConst)
  return [undefined, context]
}

const handleAssignCont = (context: Context, cont: AssignCont, value: any): [Value, Context] => {
  setVariable(context, cont.identifier.name, value)
  return [undefined, context]
}

const handleExecCont = (context: Context, cont: ExecCont): [Value, Context] => {
  const nextStatement = cont.statement
  return [nextStatement, context]
}

const handleDelimCont = (context: Context, cont: DelimCont, expr: Value): [Value, Context] => {
  return [expr, context]
}

const handleUnargCont = (context: Context, cont: UnArgCont, expr: Value): [Value, Context] => {
  const error = rttc.checkUnaryExpression(cont.node, cont.operator, expr, context.chapter)
  if (error) {
    return handleRuntimeError(context, error)
  }

  const res = evaluateUnaryExpression(cont.operator, expr)
  return [res, context]
}

const handleBinRightCont = (
  context: Context,
  cont: BinRightCont,
  expr: Value
): [Value, Context] => {
  const binBothCont: BinBothCont = {
    type: 'bin-both',
    operator: cont.operator,
    left: expr,
    node: cont.node,
    env: currentEnvironment(context)
  }

  pushCont(context, binBothCont)

  return [cont.right, context]
}

const handleBinBothCont = (context: Context, cont: BinBothCont, expr: Value): [Value, Context] => {
  const error = rttc.checkBinaryExpression(
    cont.node,
    cont.operator,
    context.chapter,
    cont.left,
    expr
  )
  if (error) {
    return handleRuntimeError(context, error)
  }

  const res = evaluateBinaryExpression(cont.operator, cont.left, expr)
  return [res, context]
}

const handleCallExprCont = (
  context: Context,
  cont: CallExprCont,
  func: CEKLiteral
): [Value, Context] => {
  if (cont.callExpr.arguments.length === 0) {
    // no args to evaluate, apply the function right away
    const newCont: FnEvalCont = {
      type: 'fn-eval',
      callExpr: cont.callExpr,
      args: [],
      func: func as Closure | Function | CapturedContinuation,
      env: currentEnvironment(context)
    }

    pushCont(context, newCont)
    return [func, context]
  } else {
    // evaluate the args first
    const args = [...cont.callExpr.arguments] as es.Expression[]
    const firstArg = args.shift()
    const newCont: FnArgCont = {
      type: 'fn-arg',
      callExpr: cont.callExpr,
      remainingArgs: args,
      evaluatedArgs: [],
      func: func as Closure | Function | CapturedContinuation,
      env: currentEnvironment(context)
    }

    pushCont(context, newCont)
    return [firstArg, context]
  }
}

function stepBlockStatement(
  node: es.BlockStatement,
  context: Context,
  isBlock: boolean
): [Value, Context] {
  declareFunctionsAndVariables(context, node)

  if (node.body.length == 0) return [undefined, context]

  for (let i = node.body.length - 1; i >= 0; i--) {
    const execCont: ExecCont = {
      type: 'exec',
      statement: node.body[i],
      env: currentEnvironment(context)
    }
    pushCont(context, execCont)
  }

  const { statement: firstStatement } = popCont(context) as ExecCont

  return [firstStatement, context]
}

function handleCallCC(func: Closure, cont: FnEvalCont, context: Context): [Value, Context] {
  const capturedCont = captureUndelimtedCont(context)

  const newCont: FnEvalCont = {
    type: 'fn-eval',
    callExpr: cont.callExpr,
    args: [capturedCont],
    func,
    env: currentEnvironment(context)
  }

  pushCont(context, newCont)

  return [func, context]
}

function handleReset(func: Closure, cont: FnEvalCont, context: Context): [Value, Context] {
  const delimCont: DelimCont = {
    type: 'delim'
  }

  pushCont(context, delimCont)

  const newCont: FnEvalCont = {
    type: 'fn-eval',
    callExpr: cont.callExpr,
    args: [],
    func,
    env: currentEnvironment(context)
  }

  pushCont(context, newCont)

  return [func, context]
}

function delimitContinuations(context: Context) {
  const conts = getAllConts(context)

  for (let i = 0; i < conts.length; i++) {
    if (conts[i].type == 'delim') {
      const withinDelim = conts.splice(0, i) // conts now contains elements after delimiter

      // remove the delimCont element
      conts.shift()

      return withinDelim
    }
  }

  return handleRuntimeError(context, new errors.ShiftWithoutReset())
}

function handleShift(func: Closure, cont: FnEvalCont, context: Context): [Value, Context] {
  // console.error('beforeShift', JSON.stringify(getAllConts(context), null, 2))

  const withinDelim = delimitContinuations(context) // modifies context

  const capturedCont: CapturedContinuation = {
    contType: 'delim',
    environment: currentEnvironment(context),
    continuations: withinDelim
  }

  // console.error(
  //   'withinDelim',
  //   JSON.stringify(withinDelim, null, 2),
  //   JSON.stringify(getAllConts(context), null, 2)
  // )

  capturedCont.toString = () => `continuation: ${capturedCont.continuations[0].type}`

  const newCont: FnEvalCont = {
    type: 'fn-eval',
    callExpr: cont.callExpr,
    args: [capturedCont],
    func,
    env: currentEnvironment(context)
  }

  pushCont(context, newCont)

  return [func, context]
}

function handleFnForBuiltin(context: Context, cont: FnEvalCont, func: Function): [Value, Context] {
  switch (func.name) {
    case 'call_cc':
      return handleCallCC(cont.args[0] as Closure, cont, context)
    case 'reset':
      return handleReset(cont.args[0] as Closure, cont, context)
    case 'shift':
      return handleShift(cont.args[0] as Closure, cont, context)

    default: {
      checkNumberOfArguments(context, func, cont.args, cont.callExpr)
      const res = func(...cont.args)
      return [res, context]
    }
  }
}

function captureUndelimtedCont(context: Context) {
  const capturedCont: CapturedContinuation = {
    contType: 'undelim',
    environment: currentEnvironment(context),
    continuations: [...getAllConts(context)] // Copies the entire list
  }
  return capturedCont
}

function handleFnForClosure(context: Context, cont: FnEvalCont, func: Closure): [Value, Context] {
  checkNumberOfArguments(context, func, cont.args, cont.callExpr)
  const environment = createEnvironment(func, cont.args, cont.callExpr)
  replaceEnvironment(context, environment)
  defineVariable(context, RETURN_CONTINUATION, captureUndelimtedCont(context), true)
  return [func.node.body, context]
}

function handleFnForCapturedCont(
  context: Context,
  cont: FnEvalCont,
  func: CapturedContinuation
): [Value, Context] {
  checkNumberOfArguments(context, func, cont.args, cont.callExpr)

  const newConts = func.continuations
  const oldEnv = func.environment
  const arg = cont.args[0]

  // console.error('cont arg', arg)

  replaceEnvironment(context, oldEnv)

  if (func.contType == 'delim') {
    const mergedCont = newConts.concat(getAllConts(context))
    replaceConts(context, mergedCont)
  } else {
    replaceConts(context, [...newConts])
  }

  return [arg, context]
}

function handleFnEvalCont(context: Context, cont: FnEvalCont, func: CEKLiteral): [Value, Context] {
  if (func instanceof Closure) {
    return handleFnForClosure(context, cont, func)
  } else if (typeof func == 'function') {
    return handleFnForBuiltin(context, cont, func)
  } else if (isCapturedCont(func)) {
    return handleFnForCapturedCont(context, cont, func)
  } else {
    return handleRuntimeError(context, new errors.CallingNonFunctionValue(func, cont.callExpr))
  }
}

function handleIfCont(context: Context, cont: IfCont, test: CEKLiteral): [Value, Context] {
  const error = rttc.checkIfStatement(cont.node, test)
  if (error) {
    return handleRuntimeError(context, error)
  }
  return test ? [cont.consequent, context] : [cont.alternate, context]
}

/**
 * WARNING: Do not use object literal shorthands, e.g.
 *   {
 *     *Literal(node: es.Literal, ...) {...},
 *     *ThisExpression(node: es.ThisExpression, ..._ {...},
 *     ...
 *   }
 * They do not minify well, raising uncaught syntax errors in production.
 * See: https://github.com/webpack/webpack/issues/7566
 */
// tslint:disable:object-literal-shorthand
// prettier-ignore

export type Stepper<T extends es.Node> = (node: T, context: Context) => [Value, Context]

function stepperForCEKLiteral(lit: CEKLiteral, context: Context): [Value, Context] {
  const cont = popCont(context)
  switchToContEnv(context, cont)

  switch (cont.type) {
    case 'empty':
      return [lit, context]
    case 'exec':
      return handleExecCont(context, cont)
    case 'unarg':
      return handleUnargCont(context, cont, lit)
    case 'bin-right':
      return handleBinRightCont(context, cont, lit)
    case 'bin-both':
      return handleBinBothCont(context, cont, lit)
    case 'var-dec':
      return handleVarDecCont(context, cont, lit)
    case 'assign':
      return handleAssignCont(context, cont, lit)
    case 'call-expr':
      return handleCallExprCont(context, cont, lit)
    case 'fn-arg':
      return handleFnArgCont(context, cont, lit)
    case 'fn-eval':
      return handleFnEvalCont(context, cont, lit)
    case 'if':
      return handleIfCont(context, cont, lit)
    case 'delim':
      return handleDelimCont(context, cont, lit)
  }
}

export const steppers: { [nodeType: string]: Stepper<es.Node> } = {
  /** Simple Values */
  Literal: function (node: es.Literal, context: Context): [Value, Context] {
    return [node.value, context]
  },

  TemplateLiteral: function (node: es.TemplateLiteral) {
    // Expressions like `${1}` are not allowed, so no processing needed
    throw new Error('Template literals not supported in x-slang')
  },

  ThisExpression: function (node: es.ThisExpression, context: Context): [Value, Context] {
    throw new Error('This expressions not supported in x-slang')
  },

  ArrayExpression: function (node: es.ArrayExpression, context: Context): [Value, Context] {
    throw new Error('Array expressions not supported in x-slang')
  },

  DebuggerStatement: function (node: es.DebuggerStatement, context: Context): [Value, Context] {
    throw new Error('Debugger statements not supported in x-slang')
  },

  FunctionExpression: function (node: es.FunctionExpression, context: Context): [Value, Context] {
    throw new Error('Function expressions not supported in x-slang')
  },

  ArrowFunctionExpression: function (
    node: es.ArrowFunctionExpression,
    context: Context
  ): [Value, Context] {
    const closure = Closure.makeFromArrowFunction(node, currentEnvironment(context), context)
    return [closure, context]
  },

  Identifier: function (node: es.Identifier, context: Context) {
    const value = getVariable(context, node.name)
    return [value, context]
  },

  CallExpression: function (node: es.CallExpression, context: Context) {
    const newCont: CallExprCont = {
      type: 'call-expr',
      callExpr: node,
      env: currentEnvironment(context)
    }

    pushCont(context, newCont)

    return [node.callee, context]
  },

  NewExpression: function (node: es.NewExpression, context: Context) {
    throw new Error('Call expressions not supported in x-slang')
  },

  UnaryExpression: function (node: es.UnaryExpression, context: Context) {
    const arg = node.argument
    const unArgCont: UnArgCont = {
      type: 'unarg',
      operator: node.operator,
      node,
      env: currentEnvironment(context)
    }

    pushCont(context, unArgCont)

    return [arg, context]
  },

  BinaryExpression: function (node: es.BinaryExpression, context: Context) {
    const left = node.left
    const binRightCont: BinRightCont = {
      type: 'bin-right',
      operator: node.operator,
      right: node.right,
      env: currentEnvironment(context),
      node
    }

    pushCont(context, binRightCont)

    return [left, context]
  },

  ConditionalExpression: function (node: es.ConditionalExpression, context: Context) {
    return this.IfStatement(node, context)
  },

  LogicalExpression: function (node: es.LogicalExpression, context: Context) {
    return this.ConditionalExpression(transformLogicalExpression(node), context)
  },

  VariableDeclaration: function (node: es.VariableDeclaration, context: Context) {
    const declaration = node.declarations[0]
    const constant = node.kind === 'const'
    const id = declaration.id as es.Identifier

    checkIfDeclared(context, id.name, constant)

    const varDecCont: VarDecCont = {
      type: 'var-dec',
      identifier: id,
      isConst: constant,
      env: currentEnvironment(context)
    }

    pushCont(context, varDecCont)
    return [declaration.init!, context]
  },

  ContinueStatement: function (node: es.ContinueStatement, context: Context) {
    throw new Error('Continue statements not supported in x-slang')
  },

  BreakStatement: function (node: es.BreakStatement, context: Context) {
    throw new Error('Break statements not supported in x-slang')
  },

  ForStatement: function (node: es.ForStatement, context: Context) {
    throw new Error('For statements not supported in x-slang')
  },

  MemberExpression: function (node: es.MemberExpression, context: Context) {
    throw new Error('Member statements not supported in x-slang')
  },

  AssignmentExpression: function (node: es.AssignmentExpression, context: Context) {
    const id = node.left as es.Identifier

    const assignCont: AssignCont = {
      type: 'assign',
      identifier: id,
      env: currentEnvironment(context)
    }

    pushCont(context, assignCont)
    return [node.right, context]
  },

  FunctionDeclaration: function (node: es.FunctionDeclaration, context: Context) {
    const id = node.id as es.Identifier
    // tslint:disable-next-line:no-any
    const closure = new Closure(node, currentEnvironment(context), context)

    const isConst = true
    const varDecCont: VarDecCont = {
      type: 'var-dec',
      identifier: id,
      isConst: isConst,
      env: currentEnvironment(context)
    }

    pushCont(context, varDecCont)

    return [closure, context]
  },

  IfStatement: function (node: es.IfStatement | es.ConditionalExpression, context: Context) {
    const ifCont: IfCont = {
      type: 'if',
      consequent: node.consequent,
      alternate: node.alternate,
      node,
      env: currentEnvironment(context)
    }

    pushCont(context, ifCont)
    return [node.test, context]
  },

  ExpressionStatement: function (node: es.ExpressionStatement, context: Context) {
    const expression = node.expression
    return [expression, context]
  },

  ReturnStatement: function (node: es.ReturnStatement, context: Context) {
    const returnArg = node.argument === null ? undefined : node.argument
    const returnCont = getVariable(context, RETURN_CONTINUATION)
    const dummyCallExpr = callExpression(primitive(1), []) // TODO something better
    const fnArgCont: FnArgCont = {
      type: 'fn-arg',
      remainingArgs: [],
      evaluatedArgs: [],
      func: returnCont,
      callExpr: dummyCallExpr,
      env: currentEnvironment(context)
    }
    pushCont(context, fnArgCont)
    return [returnArg, context]
  },

  WhileStatement: function (node: es.WhileStatement, context: Context) {
    throw new Error('While statements not supported in x-slang')
  },

  ObjectExpression: function (node: es.ObjectExpression, context: Context) {
    throw new Error('Object expressions not supported in x-slang')
  },

  BlockStatement: function (node: es.BlockStatement, context: Context) {
    pushEnvironment(context, 'blockEnvironment')
    return stepBlockStatement(node, context, true)
  },

  ImportDeclaration: function (node: es.ImportDeclaration, context: Context) {
    throw new Error('Import declarations not supported in x-slang')
  },

  Program: function (node: es.BlockStatement, context: Context) {
    context.numberOfOuterEnvironments += 1
    pushEnvironment(context, 'programEnvironment')
    return stepBlockStatement(node, context, false)
  }
}
// tslint:enable:object-literal-shorthand

export function step(expr: CEKExpr, context: Context) {
  return isCEKLiteral(expr)
    ? stepperForCEKLiteral(expr, context)
    : steppers[expr.type](expr, context)
}

export function isFinal(expr: CEKExpr, context: Context) {
  return isCEKLiteral(expr) && isEmptyCont(getCont(context))
}

export function terminal(expr: CEKExpr, context: Context): Promise<Result> {
  // console.error(JSON.stringify(expr, null, 2))
  if (isFinal(expr, context)) {
    // console.error(currentEnvironment(context))
    return Promise.resolve({ status: 'finished', context, value: expr })
  } else {
    // if (isCEKLiteral(expr)) console.error(typeof expr, getCont(context).type)
    // else console.error((expr as es.Node).type, getCont(context).type)
    try {
      const [newExpr, newContext] = step(expr, context)
      return terminal(newExpr, newContext)
    } catch (e) {
      checkForStackOverflow(e, context)
      return Promise.resolve({ status: 'error' })
    }
  }
}

export function evaluate(node: es.Program, context: Context): Promise<Result> {
  context.runtime.isRunning = true
  const [newNode, newContext] = step(node, context)
  const result = terminal(newNode, newContext)
  context.runtime.isRunning = false
  return result
}
