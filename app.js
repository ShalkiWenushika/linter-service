import express from 'express';
import bodyParser from 'body-parser';
import * as fs from 'node:fs';
import fileUpload from 'express-fileupload';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { bundleAndLoadRuleset } from '@stoplight/spectral-ruleset-bundler/with-loader';
import Parsers from '@stoplight/spectral-parsers';
import spectralCore from '@stoplight/spectral-core';
import spectralRuntime from '@stoplight/spectral-runtime';
import crypto from 'crypto';

const { Spectral, Document } = spectralCore;
const { fetch } = spectralRuntime;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());

// Define the constant for the result structure
const formattedLintingResults = (results) => ({
  count: results.length,
  list: results.map(result => ({
    code: result.code,
    path: result.path,
    message: result.message,
    severity: result.severity,
    range: result.range,
    source: result.source,
  })),
  pagination: {
    offset: 0,
    limit: results.length,
    total: results.length,
    next: null,
    previous: null
  }
});

app.post('/linter-service/lint', async (req, res) => {
  let rulesetFilePath = '';

  try {
    if (!req.files || !req.files.fileToBeLinted || !req.files.ruleset) {
      return res.status(400).json({ error: 'Both fileToBeLinted.yaml and ruleset.yaml are required.' });
    }

    // Save the uploaded ruleset file to a temporary directory
    const tempDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate a unique file name for the ruleset
    const rulesetFileName = `ruleset-${crypto.randomBytes(8).toString('hex')}.yaml`;
    rulesetFilePath = path.join(tempDir, rulesetFileName);

    // Save the ruleset file
    fs.writeFileSync(rulesetFilePath, req.files.ruleset.data);

    // Create Document instance for fileToBeLinted
    const fileToBeLintedContent = req.files.fileToBeLinted.data.toString('utf-8');
    const document = new Document(fileToBeLintedContent, Parsers.Yaml, 'fileToBeLinted.yaml');

    // Load and bundle the ruleset from the temporary file
    const ruleset = await bundleAndLoadRuleset(rulesetFilePath, { fs, fetch });

    // Initialize Spectral
    const spectral = new Spectral();
    spectral.setRuleset(ruleset);

    // Run validation
    const results = await spectral.run(document);

    // Format results
    const formattedResults = formattedLintingResults(results);

    // Respond with formatted results
    res.json(formattedResults);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred during linting.' });
  } finally {
    // Clean up the uploaded files
    if (rulesetFilePath && fs.existsSync(rulesetFilePath)) {
      fs.unlinkSync(rulesetFilePath);
    }
  }
});

export default app;
