import * as es from 'estree'
import { map } from 'lodash'

import { Context } from '../types'

export type Compiler<T extends es.Node> = (
  node: T,
  context: Context
) => es.Expression | es.Statement

export const compilers: { [nodeType: string]: Compiler<es.Node> } = {
  /** Simple Values */
  Literal: function (node: es.Literal, context: Context) {
    return node
  },

  TemplateLiteral: function (node: es.TemplateLiteral) {
    // Expressions like `${1}` are not allowed, so no processing needed
    return node
  },

  IfStatement: function (node: es.IfStatement | es.ConditionalExpression, context: Context) {
    return node
  },

  FunctionExpression: function (node: es.FunctionExpression, context: Context) {
    return node
  },

  ArrowFunctionExpression: function (node: es.ArrowFunctionExpression, context: Context) {
    return node
  },

  FunctionDeclaration: function (node: es.FunctionDeclaration, context: Context) {
    return node
  },

  ExpressionStatement: function (node: es.ExpressionStatement, context: Context) {
    return compileToLambda(node.expression, context)
  },

  ReturnStatement: function (node: es.ReturnStatement, context: Context) {
    return node
  },

  Identifier: function (node: es.Identifier, context: Context) {
    return node
  },

  CallExpression: function (node: es.CallExpression, context: Context) {
    return node
  },

  UnaryExpression: function (node: es.UnaryExpression, context: Context) {
    return {
      ...node,
      argument: compileToLambda(node.argument, context) as es.Expression
    }
  },

  BinaryExpression: function (node: es.BinaryExpression, context: Context) {
    return {
      ...node,
      left: compileToLambda(node.left, context) as es.Expression,
      right: compileToLambda(node.right, context) as es.Expression
    }
  },

  ConditionalExpression: function (node: es.ConditionalExpression, context: Context) {
    return {
      ...node,
      test: compileToLambda(node.test, context) as es.Expression,
      consequent: compileToLambda(node.consequent, context) as es.Expression,
      alternate: compileToLambda(node.alternate, context) as es.Expression
    }
  },

  LogicalExpression: function (node: es.LogicalExpression, context: Context) {
    return {
      ...node,
      left: compileToLambda(node.left, context) as es.Expression,
      right: compileToLambda(node.right, context) as es.Expression
    }
  },

  VariableDeclaration: function (node: es.VariableDeclaration, context: Context) {
    throw new Error('Variable declarations not supported in x-slang')
  },

  BlockStatement: function (node: es.BlockStatement, context: Context) {
    return {
      ...node,
      body: map(node.body, s => compileToLambda(s, context) as es.Statement)
    }
  },

  Program: function (node: es.BlockStatement, context: Context) {
    return {
      ...node,
      body: map(node.body, s => compileToLambda(s, context) as es.Statement)
    }
  },

  // These expressions are not supported in Source 2

  NewExpression: function (node: es.NewExpression, context: Context) {
    throw new Error('Call expressions not supported in x-slang')
  },

  ArrayExpression: function (node: es.ArrayExpression, context: Context) {
    throw new Error('Array expressions not supported in x-slang')
  },

  DebuggerStatement: function (node: es.DebuggerStatement, context: Context) {
    throw new Error('Debugger statements not supported in x-slang')
  },

  ContinueStatement: function (node: es.ContinueStatement, context: Context) {
    throw new Error('Continue statements not supported in x-slang')
  },

  BreakStatement: function (node: es.BreakStatement, context: Context) {
    throw new Error('Break statements not supported in x-slang')
  },

  ForStatement: function (node: es.ForStatement, context: Context) {
    // Create a new block scope for the loop variables
    throw new Error('For statements not supported in x-slang')
  },

  MemberExpression: function (node: es.MemberExpression, context: Context) {
    throw new Error('Member statements not supported in x-slang')
  },

  AssignmentExpression: function (node: es.AssignmentExpression, context: Context) {
    throw new Error('Assignment expressions not supported in x-slang')
  },

  WhileStatement: function (node: es.WhileStatement, context: Context) {
    throw new Error('While statements not supported in x-slang')
  },

  ObjectExpression: function (node: es.ObjectExpression, context: Context) {
    throw new Error('Object expressions not supported in x-slang')
  },

  ImportDeclaration: function (node: es.ImportDeclaration, context: Context) {
    throw new Error('Import declarations not supported in x-slang')
  }
}

export function compileToLambda(node: es.Node, context: Context): es.Expression | es.Statement {
  return compilers[node.type](node, context)
}
