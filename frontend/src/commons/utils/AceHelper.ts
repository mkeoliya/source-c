import { HighlightRulesSelector, ModeSelector } from 'x-slang/dist/editors/ace/modes/source';
import { Variant } from 'x-slang/dist/types';

/**
 * This _modifies global state_ and defines a new Ace mode globally, if it does not already exist.
 *
 * You can call this directly in render functions.
 */
export const selectMode = (chapter: number, variant: Variant, library: string) => {
  if (
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    typeof ace.define.modules[`ace/mode/${getModeString(variant)}`]?.Mode === 'function'
  ) {
    return;
  }

  HighlightRulesSelector(chapter, variant, library, []);
  ModeSelector(chapter, variant, library);

};

export const getModeString = (chapter: number, variant: Variant, library: string) =>
  `source${chapter}${variant}${library}`;

