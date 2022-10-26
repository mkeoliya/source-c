// Variable determining chapter of Source is contained in this file.

import { GLOBAL } from './constants'
import * as misc from './stdlib/misc'
import { Context, Continuation, CustomBuiltIns, Value, Variant } from './types'
import { createTypeEnvironment, tForAll, tVar } from './typeChecker/typeChecker'
import * as list from './stdlib/list'
import { listPrelude } from './stdlib/list.prelude'
import { contPrelude } from './stdlib/cont.prelude'
import { stringify } from './utils/stringify'

const createEmptyRuntime = () => ({
  break: false,
  debuggerOn: true,
  isRunning: false,
  environments: [],
  value: undefined,
  nodes: [],
  continuations: [{ type: 'empty' } as Continuation]
})

const createGlobalEnvironment = () => ({
  tail: null,
  name: 'global',
  head: {}
})

export const createEmptyContext = <T>(
  chapter: number,
  variant: Variant,
  externalSymbols: string[],
  externalContext?: T,
  moduleParams?: any
): Context<T> => {
  return {
    chapter,
    externalSymbols,
    errors: [],
    externalContext,
    moduleParams,
    runtime: createEmptyRuntime(),
    numberOfOuterEnvironments: 1,
    prelude: null,
    executionMethod: 'auto',
    variant,
    unTypecheckedCode: [],
    typeEnvironment: createTypeEnvironment(chapter)
  }
}

export const ensureGlobalEnvironmentExist = (context: Context) => {
  if (!context.runtime) {
    context.runtime = createEmptyRuntime()
  }
  if (!context.runtime.environments) {
    context.runtime.environments = []
  }
  if (context.runtime.environments.length === 0) {
    context.runtime.environments.push(createGlobalEnvironment())
  }
}

export const defineSymbol = (context: Context, name: string, value: Value) => {
  const globalEnvironment = context.runtime.environments[0]
  Object.defineProperty(globalEnvironment.head, name, {
    value,
    writable: false,
    enumerable: true
  })
  const typeEnv = context.typeEnvironment[0]
  // if the global type env doesn't already have the imported symbol,
  // we set it to a type var T that can typecheck with anything.
  if (!typeEnv.declKindMap.has(name)) {
    typeEnv.typeMap.set(name, tForAll(tVar('T1')))
    typeEnv.declKindMap.set(name, 'const')
  }
}

export function defineBuiltin(
  context: Context,
  name: `${string}${'=' | '...'}${string}`, // enforce minArgsNeeded
  value: Value,
  minArgsNeeded: number
): void
export function defineBuiltin(
  context: Context,
  name: string,
  value: Value,
  minArgsNeeded?: number
): void
// Defines a builtin in the given context
// If the builtin is a function, wrap it such that its toString hides the implementation
export function defineBuiltin(
  context: Context,
  name: string,
  value: Value,
  minArgsNeeded: undefined | number = undefined
) {
  if (typeof value === 'function') {
    const funName = name.split('(')[0].trim()
    const repr = `function ${name} {\n\t[implementation hidden]\n}`
    value.toString = () => repr
    value.minArgsNeeded = minArgsNeeded

    defineSymbol(context, funName, value)
  } else {
    defineSymbol(context, name, value)
  }
}

/**
 * Imports builtins from standard and external libraries.
 */
export const importBuiltins = (context: Context, externalBuiltIns: CustomBuiltIns) => {
  ensureGlobalEnvironmentExist(context)
  const rawDisplay = (v: Value, ...s: string[]) =>
    externalBuiltIns.rawDisplay(v, s[0], context.externalContext)
  const display = (v: Value, ...s: string[]) => {
    if (s.length === 1 && s[0] !== undefined && typeof s[0] !== 'string') {
      throw new TypeError('display expects the second argument to be a string')
    }
    return rawDisplay(stringify(v), s[0]), v
  }
  const displayList = (v: Value, ...s: string[]) => {
    if (s.length === 1 && s[0] !== undefined && typeof s[0] !== 'string') {
      throw new TypeError('display_list expects the second argument to be a string')
    }
    return list.rawDisplayList(display, v, s[0])
  }

  defineBuiltin(context, 'get_time()', misc.get_time)
  defineBuiltin(context, 'display(val, prepend = undefined)', display, 1)
  defineBuiltin(context, 'raw_display(str, prepend = undefined)', rawDisplay, 1)
  defineBuiltin(context, 'stringify(val, indent = 2, maxLineLength = 80)', stringify, 1)
  defineBuiltin(context, 'error(str, prepend = undefined)', misc.error_message, 1)
  defineBuiltin(context, 'is_number(val)', misc.is_number)
  defineBuiltin(context, 'is_string(val)', misc.is_string)
  defineBuiltin(context, 'is_function(val)', misc.is_function)
  defineBuiltin(context, 'is_boolean(val)', misc.is_boolean)
  defineBuiltin(context, 'is_undefined(val)', misc.is_undefined)
  defineBuiltin(context, 'parse_int(str, radix)', misc.parse_int)
  defineBuiltin(context, 'char_at(str, index)', misc.char_at)
  defineBuiltin(context, 'arity(f)', misc.arity)
  defineBuiltin(context, 'undefined', undefined)
  defineBuiltin(context, 'NaN', NaN)
  defineBuiltin(context, 'Infinity', Infinity)

  // Define all Math libraries
  const mathLibraryNames = Object.getOwnPropertyNames(Math)
  // Short param names for stringified version of math functions
  const parameterNames = [...'abcdefghijklmnopqrstuvwxyz']
  for (const name of mathLibraryNames) {
    const value = Math[name]
    if (typeof value === 'function') {
      let paramString: string
      let minArgsNeeded = undefined
      if (name === 'max' || name === 'min') {
        paramString = '...values'
        minArgsNeeded = 0
      } else {
        paramString = parameterNames.slice(0, value.length).join(', ')
      }
      defineBuiltin(context, `math_${name}(${paramString})`, value, minArgsNeeded)
    } else {
      defineBuiltin(context, `math_${name}`, value)
    }
  }

  // List library
  defineBuiltin(context, 'pair(left, right)', list.pair)
  defineBuiltin(context, 'is_pair(val)', list.is_pair)
  defineBuiltin(context, 'head(xs)', list.head)
  defineBuiltin(context, 'tail(xs)', list.tail)
  defineBuiltin(context, 'is_null(val)', list.is_null)
  defineBuiltin(context, 'list(...values)', list.list, 0)
  defineBuiltin(context, 'display_list(val, prepend = undefined)', displayList, 0)
  defineBuiltin(context, 'is_list(val)', list.is_list)

  // Continuations
  defineBuiltin(context, 'call_cc(k)', misc.call_cc)
  defineBuiltin(context, 'reset(k)', misc.reset)
  defineBuiltin(context, 'shift(k)', misc.shift)
  defineBuiltin(context, 'is_cont', misc.is_cont)
}

function importPrelude(context: Context) {
  context.prelude = listPrelude + contPrelude
}

export const importExternalSymbols = (context: Context, externalSymbols: string[]) => {
  ensureGlobalEnvironmentExist(context)

  externalSymbols.forEach(symbol => {
    defineSymbol(context, symbol, GLOBAL[symbol])
  })
}

/**
 * Imports builtins from standard and external libraries.
 */

const defaultBuiltIns: CustomBuiltIns = {
  rawDisplay: misc.rawDisplay,
  // See issue #5
  prompt: misc.rawDisplay,
  // See issue #11
  alert: misc.rawDisplay,
  visualiseList: (v: Value) => {
    throw new Error('List visualizer is not enabled')
  }
}

const createContext = <T>(
  chapter: number,
  variant: Variant,
  externalSymbols: string[] = [],
  externalContext?: T,
  externalBuiltIns: CustomBuiltIns = defaultBuiltIns,
  moduleParams?: any
) => {
  const context = createEmptyContext(
    chapter,
    variant,
    externalSymbols,
    externalContext,
    moduleParams
  )

  importBuiltins(context, externalBuiltIns)
  importPrelude(context)
  importExternalSymbols(context, externalSymbols)

  return context
}

export default createContext
