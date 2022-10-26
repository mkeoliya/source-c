import { expectResult } from '../utils/testing'

test('call_cc any true', () => {
  return expectResult(
    `
function any(predicate, lst) {
    const found = call_cc(k => {
       map(val => {
           if (predicate(val)) { 
               k(true); // short-circuit 
           } else {}
       }, lst);
       return false;
    });
    
    return found;
}

any(x => x > 2, list(1,4,6,3));
`,
    { chapter: 3, native: true }
  ).toBe(true)
})

test('call_cc any false', () => {
  return expectResult(
    `
    function any(predicate, lst) {
        const found = call_cc(k => {
           map(val => {
               if (predicate(val)) { 
                   k(true); // short-circuit 
               } else {}
           }, lst);
           return false;
        });
        
        return found;
    }
    
    any(x => x > 10, list(1,4,6,3));
    `,
    { chapter: 3, native: true }
  ).toBe(false)
})

test('call_cc multiply 0', () => {
  return expectResult(
    `
    const multiply = numbers => call_cc(k => multiply_helper(numbers, k));
    
    const multiply_helper = (numbers, k) => 
        numbers === null
        ? 1
        : head(numbers) === 0
        ? k(0)
        : head(numbers) * multiply_helper(tail(numbers), k);
        
    multiply(list(1,2,0,4,5));
    `,
    { chapter: 3, native: true }
  ).toBe(0)
})

test('call_cc capture', () => {
  return expectResult(
    `
    const x = call_cc(k => k);
if (is_cont(x)) {
    x(10);
} else {
    x;
}
`,
    { chapter: 3, native: true }
  ).toBe(10)
})

test('shift/reset invoke', () => {
  return expectResult(
    `
    100 + reset(() => 1 + shift(k => k(2)) + 3); // result: 100 + (1 + 2 + 3) = 106
    `,
    { chapter: 3, native: true }
  ).toBe(106)
})

test('shift/reset return', () => {
  return expectResult(
    `
    100 + reset(() => 1 + shift(k => 2) + 3);  // result: 100 + (2) = 102
    `,
    { chapter: 3, native: true }
  ).toBe(102)
})

test('shift/reset return differnt type', () => {
  return expectResult(
    `
    reset(() => 2 + shift(k => "hello") + 1); // result: "hello"
    `,
    { chapter: 3, native: true }
  ).toBe('hello')
})

const shift_reset_multiply = `    
const multiply = (lst) => 
    lst === null
    ? 1
    : head(lst) === 0
    ? shift(k => 0)
    : head(lst) * multiply(tail(lst));
`

test('shift/reset multiply no zero', () => {
  return expectResult(shift_reset_multiply + 'reset(() => multiply(list(1,2,3,4,5)));', {
    chapter: 3,
    native: true
  }).toBe(120)
})

test('shift/reset multiply with zero', () => {
  return expectResult(shift_reset_multiply + 'reset(() => multiply(list(1,2,0,4,5)));', {
    chapter: 3,
    native: true
  }).toBe(0)
})
