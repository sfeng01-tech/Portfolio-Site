import { parse } from '@babel/parser';

const evaluateNode = (node) => {
  switch (node.type) {
    case 'ObjectExpression': {
      const result = {};

      for (const property of node.properties) {
        if (property.type !== 'ObjectProperty' || property.computed) {
          throw new Error(`Unsupported object property: ${property.type}`);
        }

        const key = property.key.type === 'Identifier'
          ? property.key.name
          : property.key.value;

        if (typeof key !== 'string') {
          throw new Error('Portfolio object keys must be strings');
        }

        result[key] = evaluateNode(property.value);
      }

      return result;
    }

    case 'ArrayExpression':
      return node.elements.map((element) => {
        if (!element) throw new Error('Array holes are not supported');
        return evaluateNode(element);
      });

    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;

    case 'NullLiteral':
      return null;

    case 'TemplateLiteral':
      if (node.expressions.length > 0) {
        throw new Error('Template literal expressions are not supported');
      }
      return node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('');

    case 'UnaryExpression':
      if ((node.operator === '-' || node.operator === '+') && node.argument.type === 'NumericLiteral') {
        return node.operator === '-' ? -node.argument.value : node.argument.value;
      }
      throw new Error(`Unsupported unary expression: ${node.operator}`);

    default:
      throw new Error(`Unsupported value in portfolio data: ${node.type}`);
  }
};

/**
 * Parse the exported portfolio object without evaluating repository code.
 */
export const parseJSFile = (content) => {
  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: []
    });

    for (const statement of ast.program.body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      if (statement.declaration?.type !== 'VariableDeclaration') continue;

      const declaration = statement.declaration.declarations.find(
        ({ id }) => id.type === 'Identifier' && id.name === 'portfolioData'
      );

      if (declaration?.init) {
        const data = evaluateNode(declaration.init);
        validatePortfolioData(data);
        return data;
      }
    }

    throw new Error('Could not find the exported portfolioData object');
  } catch (error) {
    throw new Error(`Failed to parse JavaScript file: ${error.message}`);
  }
};

/**
 * Serialize as strict JSON inside an ES module. JSON escaping safely handles
 * quotes, backticks, interpolation markers, newlines, and Unicode.
 */
export const stringifyJSFile = (data) => {
  validatePortfolioData(data);
  return `export const portfolioData = ${JSON.stringify(data, null, 2)};\n`;
};

export const validatePortfolioData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Portfolio data must be an object');
  }

  const requiredSections = {
    profile: 'object',
    skills: 'array',
    achievements: 'array',
    experiences: 'array',
    projects: 'array',
    publications: 'array',
    talks: 'array',
    blogPosts: 'array',
    photography: 'array',
    books: 'array',
    researchPapers: 'array'
  };

  for (const [section, expectedType] of Object.entries(requiredSections)) {
    if (!(section in data)) {
      throw new Error(`Missing required section: ${section}`);
    }

    const valid = expectedType === 'array'
      ? Array.isArray(data[section])
      : data[section] && typeof data[section] === 'object' && !Array.isArray(data[section]);

    if (!valid) {
      throw new Error(`${section} must be an ${expectedType}`);
    }
  }

  return true;
};
