import { useState } from "react";
import axios from "axios";
import "./App.css";

type Job = {
  id?: string;
  title: string;
  company: string;
  location?: string;
  employmentType?: string;
  postedAt?: string;
  source?: string;
  description: string;
  applyLink: string;
  match?: number;
};

export default function JobAssistant() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState("frontend developer");
  const [location, setLocation] = useState("New Jersey");
  const [country, setCountry] = useState("USA");
  const [datePosted, setDatePosted] = useState("all");
  const [employmentType, setEmploymentType] = useState("all"); // New state for Task 1
  
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetters, setCoverLetters] = useState<Record<string, string>>({});
  const [coverLetterErrors, setCoverLetterErrors] = useState<Record<string, string>>({});
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const fetchJobs = async () => {
    try {
      const response = await axios.get("http://localhost:5000/jobs", {
        params: {
          query,
          location,
          country,
          date_posted: datePosted,
          employment_type: employmentType, // Send the new filter to backend
        },
      });
      const data: Job[] = response.data?.jobs || [];
      setJobs(data.slice(0, 20));
    } catch (error) {
      console.error("Error fetching jobs:", error);
      alert("Failed to fetch jobs. Check console for details.");
    }
  };

  const handleResumeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Optional: Validate file type
    if (file.type !== "text/plain" && !file.name.endsWith(".txt")) {
      alert("Please upload a .txt file for best compatibility.");
      return;
    }

    setResumeFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setResumeText(reader.result as string);
    };
    reader.readAsText(file);
  };

  const calculateMatch = (resume: string, desc: string) => {
    if (!resume) return 0;
    const resumeWords = resume.toLowerCase().split(/\W+/);
    const descWords = desc.toLowerCase().split(/\W+/);
    let matchCount = 0;
    descWords.forEach((word) => {
      if (resumeWords.includes(word) && word.length > 2) matchCount++;
    });
    return Math.min(100, Math.round((matchCount / descWords.length) * 100));
  };

  const sortedJobs = jobs
    .map((job) => ({
      ...job,
      match: calculateMatch(resumeText, job.description),
    }))
    .sort((a, b) => (b.match || 0) - (a.match || 0));

  const generateCoverLetter = async (job: Job) => {
    const jobKey = job.id ?? `${job.company}-${job.title}`;
    setGeneratingFor(jobKey);
    
    try {
      setCoverLetterErrors((prev) => ({ ...prev, [jobKey]: "" }));
      
      if (!resumeText) {
        throw new Error("Please upload a resume text file first.");
      }

      // Prepare payload for backend
      const payload = {
        resume: resumeText,
        job: {
          title: job.title,
          company: job.company,
          location: job.location,
          employmentType: job.employmentType,
          description: job.description,
          applyLink: job.applyLink,
        },
        ui: {
          query,
          location,
          country,
          date_posted: datePosted,
        },
      };

      // Call the backend endpoint
      const response = await axios.post("http://localhost:5000/cover-letter", payload);

      if (response.data?.coverLetter) {
        setCoverLetters((prev) => ({ 
          ...prev, 
          [jobKey]: response.data.coverLetter 
        }));
      } else {
        throw new Error("No cover letter content received from server.");
      }
    } catch (error) {
      console.error("Error generating cover letter:", error);
      
      let errorMessage = "Failed to generate cover letter.";
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.details || error.response?.data?.error || error.message;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setCoverLetterErrors((prev) => ({ 
        ...prev, 
        [jobKey]: errorMessage 
      }));
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div className="job-assistant">
      <h2 className="job-assistant__title">Job Search Assistant</h2>
      
      <div className="job-assistant__form">
        {/* Title */}
        <div className="job-assistant__field">
          <div className="job-assistant__label">Title *</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="frontend developer"
            className="job-assistant__control"
          />
        </div>

        {/* Location */}
        <div className="job-assistant__field">
          <div className="job-assistant__label">Location</div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="New Jersey"
            className="job-assistant__control"
          />
        </div>

        {/* Country */}
        <div className="job-assistant__field job-assistant__field--sm">
          <div className="job-assistant__label">Country</div>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="USA"
            className="job-assistant__control"
          />
        </div>

        {/* Date Posted */}
        <div className="job-assistant__field job-assistant__field--md">
          <div className="job-assistant__label">Date Posted</div>
          <select
            value={datePosted}
            onChange={(e) => setDatePosted(e.target.value)}
            className="job-assistant__control"
          >
            <option value="all">Any time</option>
            <option value="today">Today</option>
            <option value="3days">Last 3 days</option>
            <option value="week">Last week</option>
            <option value="month">Last month</option>
          </select>
        </div>

        {/* Employment Type (NEW for Task 1) */}
        <div className="job-assistant__field job-assistant__field--md">
          <div className="job-assistant__label">Employment Type</div>
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            className="job-assistant__control"
          >
            <option value="all">All</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="temporary">Temporary</option>
          </select>
        </div>

        {/* Search Button */}
        <button onClick={fetchJobs} className="job-assistant__submit">
          Search Jobs
        </button>
      </div>

      <br />
      <br />

      {/* Resume Upload */}
      <div className="job-assistant__resume">
        <div className="job-assistant__label">Resume Upload (.txt recommended)</div>
        
        {/* Wrap the input in a label and give it an ID to connect them */}
        <label htmlFor="resume-upload" className="custom-file-label">
          {resumeFile ? `Selected: ${resumeFile.name}` : "Click to Upload Resume"}
          <input 
            id="resume-upload" 
            type="file" 
            accept=".txt" 
            onChange={handleResumeUpload} 
            className="hidden-input"
          />
        </label>
        
        {resumeText && <p style={{fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px'}}>Loaded: {resumeFile?.name}</p>}
      </div>

      <br />
      <br />

      {/* Job Results */}
      {sortedJobs.length === 0 ? (
        <p style={{textAlign: 'center', color: 'var(--text-l)'}}>Enter search criteria and click "Search Jobs"</p>
      ) : (
        sortedJobs.map((job, index) => {
          const jobKey = job.id ?? `${job.company}-${job.title}-${index}`;
          return (
            <div key={jobKey} className="job-assistant__card">
              {coverLetterErrors[jobKey] ? (
                <div className="job-assistant__error">
                  {coverLetterErrors[jobKey]}
                </div>
              ) : null}
              
              <h3>{job.title}</h3>
              <p><strong>{job.company}</strong></p>
              {job.location ? <p>{job.location}</p> : null}
              {job.employmentType ? <p><em>Type: {job.employmentType}</em></p> : null}
              
              <p>Match: {job.match ?? 0}%</p>
              
              {job.applyLink ? (
                <a href={job.applyLink} target="_blank" rel="noreferrer" style={{color: 'var(--accent)', textDecoration: 'underline'}}>
                  Apply Here
                </a>
              ) : (
                <p>No apply link provided.</p>
              )}

              <details>
                <summary>Job Description</summary>
                <p style={{whiteSpace: 'pre-wrap', fontSize: '14px'}}>{job.description}</p>
              </details>

              <button
                onClick={() => generateCoverLetter(job)}
                className="job-assistant__cover-letter-btn"
                disabled={generatingFor === jobKey || !resumeText}
                style={{marginTop: '10px', cursor: (!resumeText || generatingFor === jobKey) ? 'not-allowed' : 'pointer'}}
              >
                {generatingFor === jobKey
                  ? "Generating..."
                  : !resumeText
                    ? "Upload Resume First"
                    : "Generate Cover Letter"}
              </button>

              {coverLetters[jobKey] ? (
                <details className="job-assistant__cover-letter" open>
                  <summary>Cover Letter Generated</summary>
                  <pre className="job-assistant__cover-letter-text">
                    {coverLetters[jobKey]}
                  </pre>
                </details>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}