const https = require('https');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { lessonID, answers } = data;

    if (!lessonID || !answers) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing lessonID or answers' })
      };
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const owner = 'okpolicymis-coder';
    const repo = 'kids-school';
    const path = `lessons-data/${lessonID}.json`;
    
    // Prepare the file content
    const fileContent = JSON.stringify({
      lessonID,
      timestamp: new Date().toISOString(),
      answers
    }, null, 2);

    // Encode to base64 for GitHub API
    const encodedContent = Buffer.from(fileContent).toString('base64');

    // Get existing file SHA (for update) or create new
    let sha = null;
    try {
      const getResponse = await makeGithubRequest(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        'GET',
        githubToken
      );
      sha = getResponse.sha;
    } catch (e) {
      // File doesn't exist yet, that's fine
    }

    // Create or update file
    const payload = {
      message: `Save lesson data: ${lessonID}`,
      content: encodedContent,
      branch: 'main'
    };

    if (sha) {
      payload.sha = sha;
    }

    const response = await makeGithubRequest(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      'PUT',
      githubToken,
      JSON.stringify(payload)
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Lesson data saved',
        path: path
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to save lesson data',
        details: error.message
      })
    };
  }
};

function makeGithubRequest(url, method, token, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'netlify-kids-school',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
