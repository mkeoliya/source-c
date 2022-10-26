/*
  This file contains definitions of some interfaces and classes that are used in Source (such as
  error-related classes).
*/

/* tslint:disable:max-classes-per-file */

import { SourceLocation } from 'acorn'
import * as es from 'estree'
import Closure from './interpreter/closure'

/**
 * Defines functions that act as built-ins, but might rely on
 * different implementations. e.g display() in a web application.
 */
export interface CustomBuiltIns {
  rawDisplay: (value: Value, str: string, externalContext: any) => Value
  prompt: (value: Value, str: string, externalContext: any) => string | null
  alert: (value: Value, str: string, externalContext: any) => void
  /* Used for list visualisation. See #12 */
  visualiseList: (list: any, externalContext: any) => void
}

export enum ErrorType {
  SYNTAX = 'Syntax',
  TYPE = 'Type',
  RUNTIME = 'Runtime'
}

export enum ErrorSeverity {
  WARNING = 'Warning',
  ERROR = 'Error'
}

// any and all errors ultimately implement this interface. as such, changes to this will affect every type of error.
export interface SourceError {
  type: ErrorType
  severity: ErrorSeverity
  location: es.SourceLocation
  explain(): string
  elaborate(): string
}

export interface Rule<T extends es.Node> {
  name: string
  disableOn?: number
  checkers: {
    [name: string]: (node: T, ancestors: es.Node[]) => SourceError[]
  }
}

export interface Comment {
  type: 'Line' | 'Block'
  value: string
  start: number
  end: number
  loc: SourceLocation | undefined
}

export type ExecutionMethod = 'native' | 'interpreter' | 'auto'
export type Variant = 'default' | 'cont'

export interface SourceLanguage {
  chapter: number
  variant: Variant
}

export type ValueWrapper = LetWrapper | ConstWrapper

export interface LetWrapper {
  kind: 'let'
  getValue: () => Value
  assignNewValue: <T>(newValue: T) => T
}

export interface ConstWrapper {
  kind: 'const'
  getValue: () => Value
}

export interface Globals {
  variables: Map<string, ValueWrapper>
  previousScope: Globals | null
}

export interface NativeStorage {
  builtins: Map<string, Value>
  previousProgramsIdentifiers: Set<string>
  operators: Map<string, (...operands: Value[]) => Value>
  gpu: Map<string, (...operands: Value[]) => Value>
  maxExecTime: number
  evaller: null | ((program: string) => Value)
  /*
  the first time evaller is used, it must be used directly like `eval(code)` to inherit
  surrounding scope, so we cannot set evaller to `eval` directly. subsequent assignments to evaller will
  close in the surrounding values, so no problem
   */
}

// CEK machine
export type CEKLiteral =
  | number
  | boolean
  | string
  | null
  | undefined
  | Function
  | Closure
  | Pair
  | List
  | CapturedContinuation

export type CEKExpr = CEKLiteral | es.Node

export function isCEKLiteral(x: any): x is CEKLiteral {
  return (
    typeof x == 'number' ||
    typeof x == 'boolean' ||
    typeof x == 'string' ||
    typeof x == 'undefined' ||
    typeof x == 'function' ||
    x == null ||
    x instanceof Closure ||
    (x as es.Node).type === undefined
  )
}

export function isFunc(x: CEKLiteral): x is Closure | Function {
  return x instanceof Closure || typeof x == 'function'
}

export function isCapturedCont(x: any): x is CapturedContinuation {
  return (
    x !== null &&
    typeof x == 'object' &&
    (x as CapturedContinuation).continuations !== undefined &&
    (x as CapturedContinuation).environment !== undefined
  )
}

// Continuations

export interface Empty {
  type: 'empty'
}

export function isEmptyCont(x: Continuation): x is Empty {
  return x.type == 'empty'
}

export interface UnArgCont {
  type: 'unarg'
  operator: es.UnaryOperator
  node: es.UnaryExpression
  env: Environment
}

export interface ExecCont {
  type: 'exec'
  statement: es.Statement
  env: Environment
}

export interface BinRightCont {
  type: 'bin-right'
  operator: es.BinaryOperator
  right: es.Expression
  node: es.BinaryExpression
  env: Environment
}

export interface BinBothCont {
  type: 'bin-both'
  operator: es.BinaryOperator
  left: CEKLiteral
  node: es.BinaryExpression
  env: Environment
}

export interface VarDecCont {
  type: 'var-dec'
  identifier: es.Identifier
  isConst: boolean
  env: Environment
}

export interface AssignCont {
  type: 'assign'
  identifier: es.Identifier
  env: Environment
}

export interface CallExprCont {
  type: 'call-expr'
  callExpr: es.CallExpression
  env: Environment
}

export interface FnArgCont {
  type: 'fn-arg'
  remainingArgs: es.Expression[]
  evaluatedArgs: CEKLiteral[]
  func: Closure | Function | CapturedContinuation
  callExpr: es.CallExpression
  env: Environment
}

export interface FnEvalCont {
  type: 'fn-eval'
  func: Closure | Function | CapturedContinuation
  args: CEKLiteral[]
  callExpr: es.CallExpression
  env: Environment
}

export interface IfCont {
  type: 'if'
  consequent: CEKExpr
  alternate: CEKExpr
  node: es.Node
  env: Environment
}

export interface DelimCont {
  type: 'delim'
}

export type Continuation =
  | Empty
  | ExecCont
  | UnArgCont
  | BinRightCont
  | BinBothCont
  | VarDecCont
  | AssignCont
  | CallExprCont
  | FnArgCont
  | FnEvalCont
  | IfCont
  | DelimCont

// CapturedContinuation object which can be assigned to variables in the environment
export interface CapturedContinuation {
  contType: 'undelim' | 'delim' // handled differently depending on the type of continuation
  environment: Environment
  continuations: Continuation[]
}

export interface Context<T = any> {
  /** The source version used */
  chapter: number

  /** The external symbols that exist in the Context. */
  externalSymbols: string[]

  /** All the errors gathered */
  errors: SourceError[]

  /** Runtime Sepecific state */
  runtime: {
    isRunning: boolean
    environments: Environment[]
    nodes: es.Node[]
    continuations: Continuation[]
  }

  moduleParams?: any

  numberOfOuterEnvironments: number

  prelude: string | null

  /**
   * Used for storing external properties.
   * For e.g, this can be used to store some application-related
   * context for use in your own built-in functions (like `display(a)`)
   */
  externalContext?: T

  /**
   * Describes the language processor to be used for evaluation
   */
  executionMethod: ExecutionMethod

  /**
   * Describes the strategy / paradigm to be used for evaluation
   * Examples: lazy, concurrent or non-deterministic
   */
  variant: Variant

  /**
   * Contains the evaluated code that has not yet been typechecked.
   */
  unTypecheckedCode: string[]
  typeEnvironment: TypeEnvironment
}

export interface BlockFrame {
  type: string
  // loc refers to the block defined by every pair of curly braces
  loc?: es.SourceLocation | null
  // For certain type of BlockFrames, we also want to take into account
  // the code directly outside the curly braces as there
  // may be variables declared there as well, such as in function definitions or for loops
  enclosingLoc?: es.SourceLocation | null
  children: (DefinitionNode | BlockFrame)[]
}

export interface DefinitionNode {
  name: string
  type: string
  loc?: es.SourceLocation | null
}

// tslint:disable:no-any
export interface Frame {
  [name: string]: any
}
export type Value = any
// tslint:enable:no-any

export type AllowedDeclarations = 'const' | 'let'

export interface Environment {
  name: string
  tail: Environment | null
  callExpression?: es.CallExpression
  head: Frame
  thisContext?: Value
}

export interface Thunk {
  value: any
  isMemoized: boolean
  f: () => any
}

export interface Error {
  status: 'error'
}

export interface Finished {
  status: 'finished'
  context: Context
  value: Value
}

export interface Suspended {
  status: 'suspended'
  it: IterableIterator<Value>
  scheduler: Scheduler
  context: Context
}

export type SuspendedNonDet = Omit<Suspended, 'status'> & { status: 'suspended-non-det' } & {
  value: Value
}

export type Result = Suspended | SuspendedNonDet | Finished | Error

export interface Scheduler {
  run(it: IterableIterator<Value>, context: Context): Promise<Result>
}

/*
  Although the ESTree specifications supposedly provide a Directive interface, the index file does not seem to export it.
  As such this interface was created here to fulfil the same purpose.
 */
export interface Directive extends es.ExpressionStatement {
  type: 'ExpressionStatement'
  expression: es.Literal
  directive: string
}

/** For use in the substituter, to differentiate between a function declaration in the expression position,
 * which has an id, as opposed to function expressions.
 */
export interface FunctionDeclarationExpression extends es.FunctionExpression {
  id: es.Identifier
  body: es.BlockStatement
}

/**
 * For use in the substituter: call expressions can be reduced into an expression if the block
 * only contains a single return statement; or a block, but has to be in the expression position.
 * This is NOT compliant with the ES specifications, just as an intermediate step during substitutions.
 */
export interface BlockExpression extends es.BaseExpression {
  type: 'BlockExpression'
  body: es.Statement[]
}

export type substituterNodes = es.Node | BlockExpression

export type TypeAnnotatedNode<T extends es.Node> = TypeAnnotation & T

export type TypeAnnotatedFuncDecl = TypeAnnotatedNode<es.FunctionDeclaration> & TypedFuncDecl

export type TypeAnnotation = Untypable | Typed | NotYetTyped

export interface TypedFuncDecl {
  functionInferredType?: Type
}

export interface Untypable {
  typability?: 'Untypable'
  inferredType?: Type
}

export interface NotYetTyped {
  typability?: 'NotYetTyped'
  inferredType?: Type
}

export interface Typed {
  typability?: 'Typed'
  inferredType?: Type
}

export type Type = Primitive | Variable | FunctionType | List | Pair | SArray
export type Constraint = 'none' | 'addable'

export interface Primitive {
  kind: 'primitive'
  name: 'number' | 'boolean' | 'string' | 'undefined'
}

export interface Variable {
  kind: 'variable'
  name: string
  constraint: Constraint
}

// cannot name Function, conflicts with TS
export interface FunctionType {
  kind: 'function'
  parameterTypes: Type[]
  returnType: Type
}

export interface PredicateType {
  kind: 'predicate'
  ifTrueType: Type | ForAll
}

export interface List {
  kind: 'list'
  elementType: Type
}

export interface SArray {
  kind: 'array'
  elementType: Type
}

export interface Pair {
  kind: 'pair'
  headType: Type
  tailType: Type
}

export interface ForAll {
  kind: 'forall'
  polyType: Type
}

export type BindableType = Type | ForAll | PredicateType

export type TypeEnvironment = {
  typeMap: Map<string, BindableType>
  declKindMap: Map<string, AllowedDeclarations>
}[]

export type PredicateTest = {
  node: TypeAnnotatedNode<es.CallExpression>
  ifTrueType: Type | ForAll
  argVarName: string
}

export type ContiguousArrayElementExpression = Exclude<es.ArrayExpression['elements'][0], null>

export type ContiguousArrayElements = ContiguousArrayElementExpression[]
