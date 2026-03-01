/**
 * xAPI statement builder and LRS client for learning path tracking.
 *
 * Generates xAPI statements conforming to the cmi5 and ADL best practices
 * profiles, and sends them to a configured Learning Record Store (LRS).
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// xAPI Verb IRIs (ADL vocabulary)
const VERBS = {
  launched: {
    id: 'http://adlnet.gov/expapi/verbs/launched',
    display: { 'en-US': 'launched' },
  },
  initialized: {
    id: 'http://adlnet.gov/expapi/verbs/initialized',
    display: { 'en-US': 'initialized' },
  },
  completed: {
    id: 'http://adlnet.gov/expapi/verbs/completed',
    display: { 'en-US': 'completed' },
  },
  passed: {
    id: 'http://adlnet.gov/expapi/verbs/passed',
    display: { 'en-US': 'passed' },
  },
  failed: {
    id: 'http://adlnet.gov/expapi/verbs/failed',
    display: { 'en-US': 'failed' },
  },
  attempted: {
    id: 'http://adlnet.gov/expapi/verbs/attempted',
    display: { 'en-US': 'attempted' },
  },
  experienced: {
    id: 'http://adlnet.gov/expapi/verbs/experienced',
    display: { 'en-US': 'experienced' },
  },
  progressed: {
    id: 'http://adlnet.gov/expapi/verbs/progressed',
    display: { 'en-US': 'progressed' },
  },
  terminated: {
    id: 'http://adlnet.gov/expapi/verbs/terminated',
    display: { 'en-US': 'terminated' },
  },
  satisfied: {
    id: 'http://adlnet.gov/expapi/verbs/satisfied',
    display: { 'en-US': 'satisfied' },
  },
  waived: {
    id: 'https://w3id.org/xapi/adl/verbs/waived',
    display: { 'en-US': 'waived' },
  },
};

// Activity types
const ACTIVITY_TYPES = {
  course: 'http://adlnet.gov/expapi/activities/course',
  module: 'http://adlnet.gov/expapi/activities/module',
  lesson: 'http://adlnet.gov/expapi/activities/lesson',
  assessment: 'http://adlnet.gov/expapi/activities/assessment',
  interaction: 'http://adlnet.gov/expapi/activities/interaction',
  media: 'http://adlnet.gov/expapi/activities/media',
  simulation: 'http://adlnet.gov/expapi/activities/simulation',
  link: 'http://adlnet.gov/expapi/activities/link',
};

/**
 * Map node types to their default xAPI activity types.
 */
const NODE_ACTIVITY_MAP = {
  theory: ACTIVITY_TYPES.lesson,
  guidedLab: ACTIVITY_TYPES.simulation,
  wiki: ACTIVITY_TYPES.lesson,
  url: ACTIVITY_TYPES.link,
  h5p: ACTIVITY_TYPES.interaction,
  cmi5: ACTIVITY_TYPES.module,
  scorm: ACTIVITY_TYPES.module,
};

/**
 * Build an xAPI actor object from user info.
 */
function buildActor(user) {
  return {
    objectType: 'Agent',
    name: user.name || 'Anonymous Learner',
    mbox: user.email ? `mailto:${user.email}` : 'mailto:anonymous@example.com',
  };
}

/**
 * Build an xAPI activity object for a learning path node.
 */
function buildActivity(pathId, node, baseUrl) {
  const activityId = node.data?.activityId
    || `${baseUrl}/learning-paths/${pathId}/nodes/${node.id}`;

  return {
    objectType: 'Activity',
    id: activityId,
    definition: {
      type: NODE_ACTIVITY_MAP[node.type] || ACTIVITY_TYPES.lesson,
      name: { 'en-US': node.data?.title || node.type },
      description: node.data?.description
        ? { 'en-US': node.data.description }
        : undefined,
    },
  };
}

/**
 * Build the parent context for a learning path.
 */
function buildPathContext(pathId, pathTitle, baseUrl) {
  return {
    contextActivities: {
      grouping: [
        {
          objectType: 'Activity',
          id: `${baseUrl}/learning-paths/${pathId}`,
          definition: {
            type: ACTIVITY_TYPES.course,
            name: { 'en-US': pathTitle },
          },
        },
      ],
    },
  };
}

/**
 * Build a complete xAPI statement.
 */
function buildStatement({ user, verb, pathId, pathTitle, node, baseUrl, result, extensions }) {
  const statement = {
    actor: buildActor(user),
    verb: VERBS[verb] || { id: verb, display: { 'en-US': verb } },
    object: buildActivity(pathId, node, baseUrl),
    context: buildPathContext(pathId, pathTitle, baseUrl),
    timestamp: new Date().toISOString(),
  };

  if (result) {
    statement.result = result;
  }

  if (extensions) {
    statement.context.extensions = extensions;
  }

  return statement;
}

/**
 * Send an xAPI statement to an LRS.
 * @param {Object} lrsConfig - { endpoint, key, secret }
 * @param {Object} statement - xAPI statement object
 * @returns {Promise<Object>} - LRS response
 */
function sendStatement(lrsConfig, statement) {
  if (!lrsConfig || !lrsConfig.endpoint) {
    return Promise.resolve({ stored: false, reason: 'No LRS configured' });
  }

  return new Promise((resolve, reject) => {
    const url = new URL('statements', lrsConfig.endpoint.replace(/\/?$/, '/'));
    const body = JSON.stringify(statement);
    const auth = Buffer.from(`${lrsConfig.key || ''}:${lrsConfig.secret || ''}`).toString('base64');
    const proto = url.protocol === 'https:' ? https : http;

    const req = proto.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Experience-API-Version': '1.0.3',
          Authorization: `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            stored: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            response: data,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ stored: false, reason: err.message });
    });

    req.write(body);
    req.end();
  });
}

/**
 * Send a batch of xAPI statements.
 */
function sendStatements(lrsConfig, statements) {
  if (!lrsConfig || !lrsConfig.endpoint) {
    return Promise.resolve({ stored: false, reason: 'No LRS configured' });
  }

  return new Promise((resolve, reject) => {
    const url = new URL('statements', lrsConfig.endpoint.replace(/\/?$/, '/'));
    const body = JSON.stringify(statements);
    const auth = Buffer.from(`${lrsConfig.key || ''}:${lrsConfig.secret || ''}`).toString('base64');
    const proto = url.protocol === 'https:' ? https : http;

    const req = proto.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Experience-API-Version': '1.0.3',
          Authorization: `Basic ${auth}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({
            stored: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            response: data,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ stored: false, reason: err.message });
    });

    req.write(body);
    req.end();
  });
}

module.exports = {
  VERBS,
  ACTIVITY_TYPES,
  NODE_ACTIVITY_MAP,
  buildActor,
  buildActivity,
  buildPathContext,
  buildStatement,
  sendStatement,
  sendStatements,
};
