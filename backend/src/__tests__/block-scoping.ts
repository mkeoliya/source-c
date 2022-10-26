import { stripIndent } from '../utils/formatters'
import { expectParsedError, expectResult } from '../utils/testing'

// This is bad practice. Don't do this!
test('standalone block statements', () => {
  return expectResult(
    stripIndent`
    function test(){
      const x = true;
      {
          const x = false;
      }
      return x;
    }
    test();
  `,
    { native: true }
  ).toMatchInlineSnapshot(`true`)
})

// This is bad practice. Don't do this!
test('const uses block scoping instead of function scoping', () => {
  return expectResult(
    stripIndent`
    function test(){
      const x = true;
      if(true) {
          const x = false;
      } else {
          const x = false;
      }
      return x;
    }
    test();
  `,
    { native: true }
  ).toMatchInlineSnapshot(`true`)
})

// This is bad practice. Don't do this!
test('let uses block scoping instead of function scoping', () => {
  return expectResult(
    stripIndent`
    function test(){
      let x = true;
      if(true) {
          let x = false;
      } else {
          let x = false;
      }
      return x;
    }
    test();
  `,
    { chapter: 3, native: true }
  ).toMatchInlineSnapshot(`true`)
})

test('No hoisting of functions. Only the name is hoisted like let and const', () => {
  return expectParsedError(stripIndent`
      const v = f();
      function f() {
        return 1;
      }
      v;
    `).toMatchInlineSnapshot(
    `"Line -1: Name f declared later in current scope but not yet assigned"`
  )
}, 30000)

test('Error when accessing temporal dead zone', () => {
  return expectParsedError(stripIndent`
    const a = 1;
    function f() {
      display(a);
      const a = 5;
    }
    f();
    `).toMatchInlineSnapshot(
    `"Line -1: Name a declared later in current scope but not yet assigned"`
  )
}, 30000)

// tslint:disable-next-line:max-line-length
test('In a block, every going-to-be-defined variable in the block cannot be accessed until it has been defined in the block.', () => {
  return expectParsedError(stripIndent`
      const a = 1;
      {
        a + a;
        const a = 10;
      }
    `).toMatchInlineSnapshot(
    `"Line -1: Name a declared later in current scope but not yet assigned"`
  )
}, 30000)

test('Shadowed variables may not be assigned to until declared in the current scope', () => {
  return expectParsedError(
    stripIndent`
  let variable = 1;
  function test(){
    variable = 100;
    let variable = true;
    return variable;
  }
  test();
  `,
    { chapter: 3 }
  ).toMatchInlineSnapshot(`"Line -1: Name variable not declared."`)
})
