import { Links } from './Constants';

const CHAP = '\xa7';

const MAIN_INTRODUCTION = `
Welcome to the Source Academy playground!

The language [_Source_](${Links.sourceDocs}) is the official language of the textbook [_Structure and
Interpretation of Computer Programs, JavaScript Adaptation_](${Links.textbook}). `;

const HOTKEYS_INTRODUCTION = `

In the editor on the left, you can use the [_Ace keyboard shortcuts_](${Links.aceHotkeys}) 
and also the [_Source Academy keyboard shortcuts_](${Links.sourceHotkeys}).

`;

const generateSourceDocsLink = (sourceType: string) => {
  switch (sourceType) {
    case 'cont':
      return `You have chosen the sublanguage [_Source ${CHAP}0_] Continuation mode.`;
    default:
      return 'You have chosen an invalid sublanguage. Please pick a sublanguage from the dropdown instead.';
  }
};

const generateIntroductionText = (sourceType: string) => {
  return MAIN_INTRODUCTION + generateSourceDocsLink(sourceType) + HOTKEYS_INTRODUCTION;
};

export const generateSourceIntroduction = (sourceVariant: string) => {
  return generateIntroductionText(`${sourceVariant}`);
};
