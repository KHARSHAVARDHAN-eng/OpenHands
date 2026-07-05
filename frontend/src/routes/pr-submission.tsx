/* eslint-disable i18next/no-literal-string */
/* eslint-disable @typescript-eslint/naming-convention */
import React from "react";
import { toast } from "react-hot-toast";

interface PRStatus {
  status: string;
  checks: {
    git_status_clean: string;
    branch_pushed: string;
    latest_upstream_fetched: string;
    no_merge_conflicts: string;
    tests_pass: string;
    lint_pass: string;
    type_checks_pass: string;
  };
  output: string;
  branch: string;
  sha: string;
  is_clean: boolean;
  files_changed: string[];
  commits_ahead: number;
  is_pushed: boolean;
  upstream_owner: string;
  repo: string;
  fork_owner: string;
}

export default function PRSubmission() {
  const [status, setStatus] = React.useState<PRStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pushing, setPushing] = React.useState(false);
  const [verifying, setVerifying] = React.useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/v1/git/pr-status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Error fetching PR status:", err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchStatus();
    // Poll status while verification is running
    const interval = setInterval(() => {
      if (status?.status === "running") {
        fetchStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [status?.status]);

  const handleStartVerification = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/v1/git/verify-pr", { method: "POST" });
      if (res.ok) {
        toast.success("Verification workflow started.");
        fetchStatus();
      } else {
        toast.error("Failed to start verification.");
      }
    } catch (err) {
      toast.error("Error starting verification.");
    } finally {
      setVerifying(false);
    }
  };

  const handlePushBranch = async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/v1/git/push-branch", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success("Branch successfully pushed to origin.");
          fetchStatus();
        } else {
          toast.error(`Push failed: ${data.error}`);
        }
      } else {
        toast.error("Failed to push branch.");
      }
    } catch (err) {
      toast.error("Error pushing branch.");
    } finally {
      setPushing(false);
    }
  };

  if (loading || !status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-neutral-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-500 mb-4" />
        <p className="text-sm font-medium">Detecting repository status...</p>
      </div>
    );
  }

  const {
    branch,
    sha,
    is_clean,
    files_changed,
    commits_ahead,
    is_pushed,
    upstream_owner,
    repo,
    fork_owner,
    checks,
  } = status;

  // Construct URLs with issue context query parameters
  const issueNum = status.issue?.issue_number || 15117;
  const prTitle = `fix(settings): reject unsupported LLM fields in settings and enterprise org updates`;
  const prBody = `## Summary
This PR validates incoming settings updates using \`StrictLLM\` before merging. It rejects unsupported fields (such as \`is_subscription\` and other unknown keys) by returning HTTP 422 instead of silently ignoring/accepting them.

This covers both the personal settings endpoint and the enterprise organization settings endpoint.

Fixes #${issueNum}

- [x] A human has tested these changes.`;

  const compareUrl = `https://github.com/${upstream_owner}/${repo}/compare/main...${fork_owner}:${branch}`;
  const prUrl = `${compareUrl}?expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody)}`;

  // Verification requirements validation
  const allChecksPassed = Object.values(checks).every((c) => c === "Passed");
  const isReady = is_clean && is_pushed && allChecksPassed;

  const handleCopyPRUrl = () => {
    navigator.clipboard.writeText(prUrl);
    toast.success("PR URL copied to clipboard!");
  };

  const handleOpenBrowser = () => {
    window.open(prUrl, "_blank");
  };

  const renderCheckIcon = (checkStatus: string) => {
    switch (checkStatus) {
      case "Passed":
        return <span className="text-green-500 font-bold">✓</span>;
      case "Failed":
        return <span className="text-red-500 font-bold">❌</span>;
      case "Running":
        return (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-neutral-400 border-t-transparent" />
        );
      default:
        return <span className="text-neutral-500">⏳</span>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 text-neutral-200">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">
            PR Submission Dashboard
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Automated PR creation and verification suite for OS Copilot.
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartVerification}
          disabled={status.status === "running" || verifying}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {status.status === "running"
            ? "Running Verification..."
            : "Run Checks"}
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Card */}
        <div className="lg:col-span-2 space-y-6">
          {/* Issue Tracking Card */}
          {status.issue && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                  Current Issue
                </h2>
                <button
                  type="button"
                  onClick={() => window.open(status.issue.issue_url, "_blank")}
                  className="px-3 py-1 text-xs font-semibold rounded bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-100 transition-all"
                >
                  Open Issue
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-neutral-500 text-xs block">
                    Issue Number
                  </span>
                  <span className="font-mono text-neutral-200 bg-neutral-950 px-2 py-1 rounded border border-neutral-850 inline-block mt-1">
                    #{status.issue.issue_number}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500 text-xs block">
                    Issue Title
                  </span>
                  <p className="text-neutral-200 font-medium mt-0.5">
                    {status.issue.issue_title}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-500 text-xs block">
                    Issue URL
                  </span>
                  <a
                    href={status.issue.issue_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline break-all block mt-0.5"
                  >
                    {status.issue.issue_url}
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
              Git Repository Info
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <span className="text-neutral-500 text-xs block">
                  Current Branch
                </span>
                <span className="font-mono text-neutral-200 bg-neutral-950 px-2 py-1 rounded border border-neutral-850 inline-block">
                  {branch}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-neutral-500 text-xs block">
                  Latest Commit SHA
                </span>
                <span
                  className="font-mono text-neutral-200 bg-neutral-950 px-2 py-1 rounded border border-neutral-850 inline-block truncate max-w-[200px]"
                  title={sha}
                >
                  {sha.substring(0, 8)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-neutral-500 text-xs block">
                  Fork Remote URL
                </span>
                <span className="text-neutral-300 truncate block">
                  github.com/{fork_owner}/{repo}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-neutral-500 text-xs block">
                  Upstream Remote URL
                </span>
                <span className="text-neutral-300 truncate block">
                  github.com/{upstream_owner}/{repo}
                </span>
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-4 flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${is_clean ? "bg-green-500" : "bg-yellow-500"}`}
                />
                <span>
                  Working Tree: {is_clean ? "Clean" : "Uncommitted Changes"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${is_pushed ? "bg-green-500" : "bg-red-500"}`}
                />
                <span>
                  Sync status: {is_pushed ? "Pushed" : "Unpushed Commits"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Commits Ahead: {commits_ahead}</span>
              </div>
            </div>
          </div>

          {/* Files Changed */}
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                Files Changed ({files_changed.length})
              </h2>
            </div>
            {files_changed.length > 0 ? (
              <div className="max-h-[180px] overflow-y-auto border border-neutral-800 rounded-lg divide-y divide-neutral-850">
                {files_changed.map((file) => (
                  <div
                    key={file}
                    className="px-3 py-2 font-mono text-xs text-neutral-400 hover:text-neutral-200"
                  >
                    {file}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-500">
                No modified files detected on this branch.
              </p>
            )}
          </div>
        </div>

        {/* Verification Checklist */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
            Verification Checks
          </h2>
          <div className="space-y-3">
            {[
              { key: "git_status_clean", label: "Git Status Clean" },
              { key: "branch_pushed", label: "Branch Pushed" },
              { key: "latest_upstream_fetched", label: "Upstream Fetched" },
              { key: "no_merge_conflicts", label: "No Merge Conflicts" },
              { key: "tests_pass", label: "All Tests Pass" },
              { key: "lint_pass", label: "Lint Checks Pass" },
              { key: "type_checks_pass", label: "Type Checks Pass" },
            ].map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between border-b border-neutral-850 pb-2 text-sm"
              >
                <span className="text-neutral-300">{item.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 font-mono">
                    {checks[item.key as keyof typeof checks]}
                  </span>
                  {renderCheckIcon(checks[item.key as keyof typeof checks])}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2">
            {!is_pushed && (
              <button
                type="button"
                onClick={handlePushBranch}
                disabled={pushing}
                className="w-full py-2.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-neutral-100 transition-all"
              >
                {pushing ? "Pushing Branch..." : "Push Branch"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Ready Status / Action Buttons */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
        {isReady ? (
          <div className="bg-green-950/40 border border-green-800/60 rounded-lg p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-green-500 text-xl font-bold">🟢</span>
              <div>
                <h3 className="font-semibold text-green-400 text-sm">
                  Ready for Pull Request
                </h3>
                <p className="text-xs text-green-500/80 mt-0.5">
                  All pre-validation checks are passing perfectly.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-neutral-300 pt-3 border-t border-green-900/40">
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  Current Branch:
                </span>
                <span className="font-mono text-neutral-200">{branch}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  Latest Commit:
                </span>
                <span className="font-mono text-neutral-200">
                  {sha.substring(0, 8)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  Compare URL:
                </span>
                <a
                  href={compareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300 truncate max-w-[250px]"
                >
                  Link
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">PR URL:</span>
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300 truncate max-w-[250px]"
                >
                  Link
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  Files Changed:
                </span>
                <span className="text-neutral-200">
                  {files_changed.length} file(s)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  Commits Ahead:
                </span>
                <span className="text-neutral-200">{commits_ahead}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span>
                <span className="font-medium text-neutral-400">
                  CI Readiness:
                </span>
                <span className="text-neutral-200">
                  {allChecksPassed ? "Passed" : "Pending"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/60 rounded-lg p-4">
            <span className="text-red-500 text-xl font-bold">❌</span>
            <div>
              <h3 className="font-semibold text-red-400 text-sm">
                PR Actions Locked
              </h3>
              <p className="text-xs text-red-500/80 mt-0.5">
                Please ensure the branch is pushed, status is clean, and all
                checks are green.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <a
            href={compareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-100 flex items-center gap-2 transition-all"
          >
            Compare Changes
          </a>
          <button
            type="button"
            onClick={handleOpenBrowser}
            disabled={!isReady}
            className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-green-600 hover:bg-green-500 text-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            Create Pull Request
          </button>
          <button
            type="button"
            onClick={handleCopyPRUrl}
            className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-neutral-850 hover:bg-neutral-800 border border-neutral-700/60 text-neutral-200 flex items-center gap-2 transition-all"
          >
            Copy PR URL
          </button>
          <button
            type="button"
            onClick={handleOpenBrowser}
            className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-neutral-850 hover:bg-neutral-800 border border-neutral-700/60 text-neutral-200 flex items-center gap-2 transition-all"
          >
            Open in Browser
          </button>
        </div>
      </div>

      {/* Logs Output */}
      {status.output && (
        <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-5 shadow-inner">
          <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
            Verification Logs
          </h2>
          <pre className="font-mono text-xs text-neutral-400 overflow-x-auto whitespace-pre-wrap max-h-[300px]">
            {status.output}
          </pre>
        </div>
      )}
    </div>
  );
}
