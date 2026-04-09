/**
 * Parse TypeScript Parameters
 * 
 * Extract function parameters from TypeScript AST
 */

import * as ts from 'typescript'

export interface JSONSchema {
  type: string
  properties?: Record<string, any>
  required?: string[]
  description?: string
  [key: string]: any
}

export interface ParameterInfo {
  name: string
  type: string
  required: boolean
  description?: string
  defaultValue?: string
}

export function parseParameters(node: ts.FunctionDeclaration): JSONSchema {
  const parameters = node.parameters
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const param of parameters) {
    const name = param.name.getText()
    const typeNode = param.type
    const isOptional = !!param.questionToken
    const type = typeNode ? mapTsTypeToJsonSchema(typeNode) : 'any'
    const description = extractJsDocDescription(node, name)
    const defaultValue = param.initializer?.getText()

    properties[name] = {
      type,
      description,
      ...(defaultValue && { default: defaultValue }),
    }

    if (!isOptional && !defaultValue) {
      required.push(name)
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    description: extractJsDocDescription(node),
  }
}

export function parseObjectParameters(node: ts.InterfaceDeclaration): JSONSchema {
  const properties: Record<string, any> = {}
  const required: string[] = []

  for (const member of node.members) {
    if (ts.isPropertySignature(member)) {
      const name = member.name.getText()
      const typeNode = member.type
      const isOptional = !!member.questionToken
      const type = typeNode ? mapTsTypeToJsonSchema(typeNode) : 'any'
      const description = extractJsDocFromNode(member)

      properties[name] = {
        type,
        description,
      }

      if (!isOptional) {
        required.push(name)
      }
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
    description: extractJsDocFromNode(node),
  }
}

function mapTsTypeToJsonSchema(type: ts.TypeNode): string {
  if (!type) return 'any'

  const kind = type.kind
  
  if (kind === ts.SyntaxKind.StringKeyword) return 'string'
  if (kind === ts.SyntaxKind.NumberKeyword) return 'number'
  if (kind === ts.SyntaxKind.BooleanKeyword) return 'boolean'
  if (kind === ts.SyntaxKind.ObjectKeyword) return 'object'
  if (kind === ts.SyntaxKind.AnyKeyword) return 'any'
  if (kind === ts.SyntaxKind.VoidKeyword) return 'void'
  if (kind === ts.SyntaxKind.NullKeyword) return 'null'
  if (kind === ts.SyntaxKind.UndefinedKeyword) return 'undefined'
  
  if (ts.isArrayTypeNode(type)) {
    const elementType = mapTsTypeToJsonSchema(type.elementType)
    return `array<${elementType}>`
  }
  
  if (ts.isTypeReferenceNode(type)) {
    return type.typeName.getText()
  }
  
  if (ts.isUnionTypeNode(type)) {
    return type.types.map((t: ts.TypeNode) => mapTsTypeToJsonSchema(t)).join(' | ')
  }
  
  if (ts.isLiteralTypeNode(type)) {
    return type.literal.getText()
  }

  return 'any'
}

function extractJsDocDescription(node: ts.Node, paramName?: string): string | undefined {
  let nodeToCheck: ts.Node = node
  
  if (paramName && ts.isFunctionDeclaration(node)) {
    const param = node.parameters.find(p => p.name.getText() === paramName)
    if (param) nodeToCheck = param
  }

  const jsDocTags = ts.getJSDocTags(nodeToCheck)
  
  if (paramName) {
    const paramTag = jsDocTags.find(tag => 
      tag.tagName.getText() === 'param' && 
      typeof tag.comment === 'string' && 
      tag.comment.includes(paramName)
    )
    return paramTag?.comment?.toString().replace(`${paramName} `, '')
  }

  const returnTag = jsDocTags.find(tag => tag.tagName.getText() === 'returns')
  if (returnTag) return returnTag.comment?.toString()

  const jsDocComments = ts.getJSDocCommentsAndTags(node)
  if (jsDocComments.length > 0) {
    const firstComment = jsDocComments[0]
    if (typeof firstComment.comment === 'string') {
      return firstComment.comment
    }
  }

  return undefined
}

function extractJsDocFromNode(node: ts.Node): string | undefined {
  const jsDocComments = ts.getJSDocCommentsAndTags(node)
  if (jsDocComments.length > 0) {
    const firstComment = jsDocComments[0]
    if (typeof firstComment.comment === 'string') {
      return firstComment.comment
    }
  }
  return undefined
}

export function getFunctionParameters(
  sourceFile: ts.SourceFile,
  functionName: string
): ParameterInfo[] {
  const parameters: ParameterInfo[] = []

  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.name.getText() === functionName
    ) {
      for (const param of node.parameters) {
        parameters.push({
          name: param.name.getText(),
          type: param.type?.getText() || 'any',
          required: !param.questionToken && !param.initializer,
          description: extractJsDocDescription(node, param.name.getText()),
          defaultValue: param.initializer?.getText(),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return parameters
}