import "dotenv/config";
import express from "express";
import axios from "axios";
import cors from "cors";
import http from 'http';
import https from 'https';

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Configuration
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const JOB_SEARCH_HOST = "jsearch.p.rapidapi.com";
const COVER_LETTER_HOST = "ai-resume-and-job-enhancer.p.rapidapi.com"; 

function buildJSearchQuery({ query, location }) {
  const q = (query ?? "").toString().trim();
  const loc = (location ?? "").toString().trim();

  if (!q && !loc) return "";
  if (q && !loc) return q;
  if (!q && loc) return `jobs in ${loc}`;

  return `${q} jobs in ${loc}`;
}

// --- Job Search Endpoint (Existing + Updated with Employment Type) ---
app.get("/jobs", async (req, res) => {
  try {
    if (!RAPIDAPI_KEY) {
      return res.status(500).json({
        error: "Missing RAPIDAPI_KEY on server",
      });
    }

    const {
      query,
      location,
      page = "1",
      num_pages = "1",
      country = "us",
      date_posted = "all",
      employment_type = "all", // Added for Task 1
    } = req.query;

    const builtQuery = buildJSearchQuery({ query, location });
    if (!builtQuery) {
      return res.status(400).json({
        error: "Please provide query and/or location",
      });
    }

    // Prepare params for JSearch
    const jSearchParams = {
      query: builtQuery,
      page,
      num_pages,
      country,
      date_posted,
    };

    // Only add employment_type if it's not "all" to keep the request clean
    if (employment_type && employment_type !== "all") {
      jSearchParams.employment_type = employment_type;
    }

    const response = await axios.get(`https://${JOB_SEARCH_HOST}/search`, {
      params: jSearchParams,
      headers: {
        "Content-Type": "application/json",
        "x-rapidapi-host": JOB_SEARCH_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY,
      },
    });

    const rawJobs = response?.data?.data ?? [];
    const jobs = rawJobs.map((j) => ({
      id: j.job_id ?? j.job_apply_link ?? `${j.employer_name ?? ""}-${j.job_title ?? ""}`,
      title: j.job_title ?? "",
      company: j.employer_name ?? "",
      location:
        j.job_city || j.job_state || j.job_country
          ? [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", ")
          : j.job_location ?? "",
      employmentType: j.job_employment_type ?? "",
      postedAt: j.job_posted_at_datetime_utc ?? "",
      description: j.job_description ?? "",
      applyLink: j.job_apply_link ?? j.job_google_link ?? "",
      source: j.job_publisher ?? "",
    }));

    res.json({
      query: {
        query: builtQuery,
        page: Number(page),
        num_pages: Number(num_pages),
        country,
        date_posted,
        employment_type,
      },
      jobs,
      raw: response.data,
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 500;
      const message =
        (error.response?.data && typeof error.response.data === "object" && "message" in error.response.data
          ? error.response.data.message
          : undefined) ?? error.message;

      console.error("JSearch request failed:", status, message);
      return res.status(status).json({
        error: "Failed to fetch jobs",
        upstream: { status, message },
      });
    }

    console.error(error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// --- Cover Letter Generation Endpoint (Task 2 Implementation) ---
app.post("/cover-letter", async (req, res) => {
    try {
      const { resume, job, ui } = req.body;
  
      if (!resume || !job) {
        return res.status(400).json({ error: "Missing required fields: resume and job" });
      }
  
      const contextPrompt = `Position: ${job.title} at ${job.company}. Location: ${job.location}. Employment Type: ${job.employmentType}. Search Query: ${ui?.query || ''}`;
      
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
      const apiUrl = `https://${COVER_LETTER_HOST}/cover-letter-generation`;
      
      // Construct the multipart body manually
      let body = '';
      
      // Helper to add a part
      const addPart = (fieldName, content, isFile = false) => {
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="${fieldName}"${isFile ? '; filename="resume.txt"' : ''}\r\n`;
        if (isFile) {
          body += `Content-Type: text/plain\r\n`;
        }
        body += `\r\n`;
        body += `${content}\r\n`;
      };
  
      // Add resume as 'cv' (file-like)
      addPart('cv', resume, true);
      
      // Add job description as optional text
      if (job.description) {
        addPart('job_description', job.description);
      }
      
      // Add additional info
      if (contextPrompt) {
        addPart('additional_info', contextPrompt);
      }
  
      // Close the boundary
      body += `--${boundary}--\r\n`;
  
      // Parse the URL
      const urlObj = new URL(apiUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;
  
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'x-rapidapi-host': COVER_LETTER_HOST,
          'x-rapidapi-key': RAPIDAPI_KEY,
          'Content-Length': Buffer.byteLength(body)
        }
      };
  
      // Make the request
      const apiResponse = await new Promise((resolve, reject) => {
        const req = protocol.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`API Error: ${res.statusCode} - ${data}`));
            }
          });
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
      });
  
      // Extract result
      let coverLetterText = "";
      if (apiResponse && typeof apiResponse === 'object') {
          coverLetterText = apiResponse.text || 
                            apiResponse.result || 
                            apiResponse.cover_letter || 
                            apiResponse.message ||
                            JSON.stringify(apiResponse);
      } else if (typeof apiResponse === 'string') {
          coverLetterText = apiResponse;
      }
  
      if (!coverLetterText) {
        return res.status(500).json({ error: "API returned empty response", raw: apiResponse });
      }
  
      res.json({ coverLetter: coverLetterText });
  
    } catch (error) {
      console.error("Cover letter generation failed:", error);
      
      if (error.message) {
        const match = error.message.match(/API Error: (\d+) - (.*)/);
        const status = match ? parseInt(match[1]) : 500;
        const details = match ? match[2] : error.message;
        
        console.error("Raw RapidAPI Error:", details);
  
        return res.status(status).json({
          error: "Cover letter generation failed",
          details: details,
          upstreamStatus: status
        });
      }
  
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.listen(5000, () => console.log("Server running on port 5000"));