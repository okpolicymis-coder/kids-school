const https = require('https');

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

function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString('utf-8');
}

exports.handler = async (event) => {
  console.log('Save lesson data function called');
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);
    const { week, part, answers } = data;
    console.log('Received data:', { week, part, hasAnswers: !!answers });

    if (!week || !part || !answers) {
      console.log('Missing required fields:', { week, part, answers: !!answers });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing week, part, or answers' })
      };
    }
    
    const lessonID = `Week${week}-${part}`;
    console.log('Lesson ID:', lessonID);

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error('GITHUB_TOKEN environment variable not set!');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error: missing GitHub token' })
      };
    }
    
    const owner = 'okpolicymis-coder';
    const repo = 'kids-school';
    const path = `lessons-data/${lessonID}.json`;
    const timestamp = new Date().toISOString();

    console.log('Fetching existing file from GitHub...');
    
    // Try to fetch existing file
    let fileData = {
      week,
      part,
      attempts: []
    };
    let sha = null;

    try {
      const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
      console.log('GET URL:', getUrl);
      const getResponse = await makeGithubRequest(getUrl, 'GET', githubToken);
      console.log('File exists, decoding...');
      const decodedContent = decodeBase64(getResponse.content);
      fileData = JSON.parse(decodedContent);
      sha = getResponse.sha;
      console.log(`Found ${fileData.attempts.length} existing attempts`);
    } catch (e) {
      console.log('File does not exist or error fetching:', e.message);
      // File doesn't exist yet, that's fine
    }

    // Add new attempt to attempts array
    fileData.attempts.push({
      timestamp: timestamp,
      answers: answers
    });
    
    console.log(`Now have ${fileData.attempts.length} total attempts`);

    // Prepare updated file content
    const fileContent = JSON.stringify(fileData, null, 2);
    const encodedContent = Buffer.from(fileContent).toString('base64');

    // Create or update file
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const payload = {
      message: `Save attempt for ${lessonID} at ${timestamp}`,
      content: encodedContent,
      branch: 'main'
    };

    if (sha) {
      payload.sha = sha;
      console.log('Updating existing file, SHA:', sha.substring(0, 8));
    } else {
      console.log('Creating new file');
    }

    console.log('Sending PUT request to GitHub...');
    const putResponse = await makeGithubRequest(putUrl, 'PUT', githubToken, JSON.stringify(payload));
    console.log('Success! File saved to GitHub');

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Attempt saved successfully',
        lessonID,
        timestamp,
        attemptNumber: fileData.attempts.length,
        path
      })
    };

  } catch (error) {
    console.error('ERROR:', error);
    console.error('Stack:', error.stack);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to save lesson data',
        details: error.message
      })
    };
  }
};
