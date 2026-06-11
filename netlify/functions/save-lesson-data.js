const https = require('https');

// GitHub API helper
function makeGithubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      reject(new Error('GITHUB_TOKEN not configured'));
      return;
    }

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'Netlify-Function',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error ${res.statusCode}: ${parsed.message || data}`));
          } else {
            resolve({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Base64 encode
function encodeBase64(str) {
  return Buffer.from(str).toString('base64');
}

// Base64 decode
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

exports.handler = async (event, context) => {
  console.log('Save lesson data function called');
  console.log('Method:', event.httpMethod);
  console.log('Body:', event.body);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const payload = JSON.parse(event.body);
    console.log('Parsed payload:', payload);

    const { week, part, timestamp, answers } = payload;

    if (!week || !part || !timestamp || !answers) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    // Read current attempts.json from GitHub
    console.log('Fetching Max/attempts.json from GitHub...');
    let attempts = [];
    let sha = null;

    try {
      const getResponse = await makeGithubRequest(
        'GET',
        '/repos/okpolicymis-coder/kids-school/contents/Max/attempts.json'
      );
      if (getResponse.data.content) {
        const fileContent = decodeBase64(getResponse.data.content);
        attempts = JSON.parse(fileContent);
        sha = getResponse.data.sha;
        console.log('Retrieved existing attempts:', attempts.length);
      }
    } catch (error) {
      console.log('attempts.json does not exist yet, creating new:', error.message);
      attempts = [];
      sha = null;
    }

    // Add new attempt
    const newAttempt = {
      week,
      part,
      timestamp,
      answers
    };
    attempts.push(newAttempt);
    console.log('Added new attempt. Total attempts:', attempts.length);

    // Write back to GitHub
    console.log('Writing attempts.json to GitHub...');
    const content = encodeBase64(JSON.stringify(attempts, null, 2));
    const writePayload = {
      message: `Save attempt: Week ${week} - ${part} (${timestamp})`,
      content: content
    };

    if (sha) {
      writePayload.sha = sha;
    }

    const writeResponse = await makeGithubRequest(
      'PUT',
      '/repos/okpolicymis-coder/kids-school/contents/Max/attempts.json',
      writePayload
    );

    console.log('Successfully saved to GitHub');
    console.log('Response status:', writeResponse.status);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Assessment saved to GitHub',
        attemptCount: attempts.length
      })
    };

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
