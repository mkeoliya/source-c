import * as React from 'react';
import { createContext, hasDeclaration } from 'x-slang';

import { Links } from '../utils/Constants';
import { EditorHook } from './Editor';

// EditorHook structure:
// EditorHooks grant access to 4 things:
// inProps are provided by the parent component
// outProps go into the underlying React-Ace
// keyBindings allow exporting new hotkeys
// reactAceRef is the underlying reactAce instance for hooking.

const useNavigation: EditorHook = (inProps, outProps, keyBindings, reactAceRef) => {
  const propsRef = React.useRef(inProps);
  propsRef.current = inProps;

  const handleNavigate = React.useCallback(() => {
    const editor = reactAceRef.current!.editor;
    const pos = editor.selection.getCursor();
    const token = editor.session.getTokenAt(pos.row, pos.column);
    const { sourceVariant, handleDeclarationNavigate } = propsRef.current;

    handleDeclarationNavigate(editor.getCursorPosition());

    const newPos = editor.selection.getCursor();
    if (newPos.row !== pos.row || newPos.column !== pos.column) {
      return;
    }

    if (
      hasDeclaration(editor.getValue(), createContext(sourceVariant), {
        line: newPos.row + 1, // getCursorPosition returns 0-indexed row, function here takes in 1-indexed row
        column: newPos.column
      })
    ) {
      return;
    }

    const url = Links.sourceDocs;

    if (
      token !== null &&
      (/\bsupport.function\b/.test(token.type) || /\bbuiltinconsts\b/.test(token.type))
    ) {
      window.open(`${url}source_${sourceVariant}/global.html#${token.value}`); // opens builtn library link
    }
    if (token !== null && /\bstorage.type\b/.test(token.type)) {
      window.open(`${url}source_${sourceVariant}.pdf`);
    }
  }, [reactAceRef]);

  keyBindings.navigate = handleNavigate;
};

export default useNavigation;
