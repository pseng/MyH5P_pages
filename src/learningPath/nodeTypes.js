/**
 * Node type definitions for the Learning Path Creator.
 * Each node type represents a different kind of learning object.
 */

const NODE_TYPES = {
  // --- Start / End control nodes ---
  start: {
    id: 'start',
    label: 'Start',
    category: 'control',
    color: '#4CAF50',
    icon: '▶',
    maxInstances: 1,
    outputs: ['next'],
    inputs: [],
    fields: [],
  },
  end: {
    id: 'end',
    label: 'End',
    category: 'control',
    color: '#f44336',
    icon: '⏹',
    maxInstances: 1,
    outputs: [],
    inputs: ['prev'],
    fields: [
      { name: 'completionMessage', type: 'text', label: 'Completion Message', default: 'Congratulations! You have completed this learning path.' },
    ],
  },

  // --- Learning Object nodes ---
  theory: {
    id: 'theory',
    label: 'Theory Unit',
    category: 'content',
    color: '#2196F3',
    icon: '📖',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'content', type: 'richtext', label: 'Content (HTML)' },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 15 },
      { name: 'passingScore', type: 'number', label: 'Passing Score (%)', default: 0 },
    ],
  },
  guidedLab: {
    id: 'guidedLab',
    label: 'Guided Lab',
    category: 'content',
    color: '#FF9800',
    icon: '🔬',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'labUrl', type: 'url', label: 'Lab Environment URL' },
      { name: 'instructions', type: 'richtext', label: 'Instructions (HTML)' },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 45 },
      { name: 'passingScore', type: 'number', label: 'Passing Score (%)', default: 70 },
    ],
  },
  wiki: {
    id: 'wiki',
    label: 'Wiki Page',
    category: 'content',
    color: '#9C27B0',
    icon: '📝',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'content', type: 'richtext', label: 'Wiki Content (HTML)' },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 10 },
    ],
  },
  url: {
    id: 'url',
    label: 'Website URL',
    category: 'content',
    color: '#00BCD4',
    icon: '🌐',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'url', type: 'url', label: 'URL', required: true },
      { name: 'openInNewTab', type: 'checkbox', label: 'Open in new tab', default: false },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 10 },
    ],
  },
  h5p: {
    id: 'h5p',
    label: 'H5P Package',
    category: 'package',
    color: '#1a73e8',
    icon: '🎓',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'h5pContentId', type: 'h5p-picker', label: 'H5P Content' },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 20 },
      { name: 'passingScore', type: 'number', label: 'Passing Score (%)', default: 70 },
    ],
  },
  cmi5: {
    id: 'cmi5',
    label: 'cmi5 Package',
    category: 'package',
    color: '#E91E63',
    icon: '📦',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'packageUrl', type: 'url', label: 'Package URL / Launch URL', required: true },
      { name: 'activityId', type: 'text', label: 'Activity ID (IRI)' },
      { name: 'moveOn', type: 'select', label: 'Move On Criteria', options: ['Completed', 'Passed', 'CompletedOrPassed', 'CompletedAndPassed', 'NotApplicable'], default: 'CompletedOrPassed' },
      { name: 'masteryScore', type: 'number', label: 'Mastery Score (%)', default: 70 },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 30 },
    ],
  },
  scorm: {
    id: 'scorm',
    label: 'SCORM Package',
    category: 'package',
    color: '#795548',
    icon: '📚',
    outputs: ['next'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Title', required: true },
      { name: 'description', type: 'textarea', label: 'Description' },
      { name: 'packageUrl', type: 'url', label: 'SCORM Package URL / Launch URL', required: true },
      { name: 'scormVersion', type: 'select', label: 'SCORM Version', options: ['1.2', '2004 3rd Edition', '2004 4th Edition'], default: '2004 4th Edition' },
      { name: 'passingScore', type: 'number', label: 'Passing Score (%)', default: 70 },
      { name: 'estimatedMinutes', type: 'number', label: 'Estimated Duration (min)', default: 30 },
    ],
  },

  // --- Flow control ---
  gate: {
    id: 'gate',
    label: 'Gate (Pass Required)',
    category: 'control',
    color: '#FF5722',
    icon: '🚧',
    outputs: ['pass', 'fail'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Gate Title', default: 'Progress Check' },
      { name: 'requiredScore', type: 'number', label: 'Required Score (%)', default: 70 },
    ],
  },
  branch: {
    id: 'branch',
    label: 'Branch',
    category: 'control',
    color: '#607D8B',
    icon: '🔀',
    outputs: ['pathA', 'pathB'],
    inputs: ['prev'],
    fields: [
      { name: 'title', type: 'text', label: 'Branch Title' },
      { name: 'conditionType', type: 'select', label: 'Condition', options: ['score-based', 'learner-choice', 'random'], default: 'learner-choice' },
      { name: 'pathALabel', type: 'text', label: 'Path A Label', default: 'Path A' },
      { name: 'pathBLabel', type: 'text', label: 'Path B Label', default: 'Path B' },
    ],
  },
};

/**
 * Validate a node's data against its type definition.
 */
function validateNode(node) {
  const typeDef = NODE_TYPES[node.type];
  if (!typeDef) {
    return { valid: false, errors: [`Unknown node type: ${node.type}`] };
  }
  const errors = [];
  for (const field of typeDef.fields) {
    if (field.required && (!node.data || !node.data[field.name])) {
      errors.push(`${field.label} is required`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate the entire learning path graph.
 */
function validatePath(pathData) {
  const errors = [];
  const { nodes, connections } = pathData;

  if (!nodes || nodes.length === 0) {
    errors.push('Learning path must have at least one node');
    return { valid: false, errors };
  }

  const startNodes = nodes.filter((n) => n.type === 'start');
  const endNodes = nodes.filter((n) => n.type === 'end');

  if (startNodes.length === 0) {
    errors.push('Learning path must have a Start node');
  }
  if (startNodes.length > 1) {
    errors.push('Learning path can only have one Start node');
  }
  if (endNodes.length === 0) {
    errors.push('Learning path must have an End node');
  }

  // Validate individual nodes
  for (const node of nodes) {
    const result = validateNode(node);
    if (!result.valid) {
      const label = node.data?.title || NODE_TYPES[node.type]?.label || node.id;
      for (const err of result.errors) {
        errors.push(`[${label}] ${err}`);
      }
    }
  }

  // Validate connections reference valid nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  if (connections) {
    for (const conn of connections) {
      if (!nodeIds.has(conn.from)) {
        errors.push(`Connection references non-existent source node: ${conn.from}`);
      }
      if (!nodeIds.has(conn.to)) {
        errors.push(`Connection references non-existent target node: ${conn.to}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { NODE_TYPES, validateNode, validatePath };
