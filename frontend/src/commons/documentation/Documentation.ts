import { SourceDocumentation } from 'x-slang';

const externalLibrariesDocumentation = {};

const MAX_CAPTION_LENGTH = 25;

function shortenCaption(name: string): string {
  if (name.length <= MAX_CAPTION_LENGTH) {
    return name;
  }

  return (name = name.substring(0, MAX_CAPTION_LENGTH - 3) + '...');
}

const builtinDocumentation = {};

Object.entries(SourceDocumentation.builtins).forEach((chapterDoc: any) => {
  const [chapter, docs] = chapterDoc;
  builtinDocumentation[chapter] = Object.entries(docs).map((entry: any) => {
    const [name, info] = entry;
    return {
      caption: shortenCaption(name),
      value: name,
      meta: info.meta,
      docHTML: info.description
    };
  });
});

export const Documentation = {
  builtins: builtinDocumentation,
  externalLibraries: externalLibrariesDocumentation
};
