import { Octokit } from "@octokit/rest";
import { getSetting } from "./settings";

async function getClient(): Promise<Octokit> {
  const token = await getSetting("GITHUB_TOKEN");
  if (!token) throw new Error("GITHUB_TOKEN is not configured. Add it in Settings → GitHub.");
  return new Octokit({ auth: token });
}

async function getRepo(service: string): Promise<{ owner: string; repo: string }> {
  const org = await getSetting("GITHUB_ORG");
  const defaultRepos: Record<string, string> = {
    hub: "kantage-hub", builder: "kantage-builder", deploy: "kantage-deploy",
  };
  const keyMap: Record<string, string> = {
    hub: "HUB_REPO", builder: "BUILDER_REPO", deploy: "DEPLOY_REPO",
  };
  const repo = await getSetting(keyMap[service] || "", defaultRepos[service] || service);
  if (!org || !repo) throw new Error(`GitHub org/repo not configured for ${service}. Add it in Settings → GitHub.`);
  return { owner: org, repo };
}

export async function getFileTree(service: string, maxFiles = 200): Promise<{ path: string; type: string }[]> {
  const octokit = await getClient();
  const { owner, repo } = await getRepo(service);
  const { data } = await octokit.git.getTree({ owner, repo, tree_sha: "HEAD", recursive: "1" });
  return (data.tree || [])
    .filter(f => f.type === "blob" && f.path)
    .filter(f => !f.path!.includes("node_modules") && !f.path!.includes(".next") && !f.path!.includes("dist"))
    .slice(0, maxFiles)
    .map(f => ({ path: f.path!, type: f.type! }));
}

export async function readFile(service: string, filePath: string): Promise<{ content: string; sha: string }> {
  const octokit = await getClient();
  const { owner, repo } = await getRepo(service);
  const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
  if (Array.isArray(data) || data.type !== "file") throw new Error(`${filePath} is not a file`);
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return { content, sha: data.sha };
}

export async function commitFiles(
  service: string,
  changes: { path: string; content: string }[],
  message: string
): Promise<string> {
  const octokit = await getClient();
  const { owner, repo } = await getRepo(service);

  const { data: refData } = await octokit.git.getRef({ owner, repo, ref: "heads/main" });
  const latestSha = refData.object.sha;

  const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: latestSha });
  const baseTreeSha = commitData.tree.sha;

  const blobShas = await Promise.all(
    changes.map(async (c) => {
      const { data } = await octokit.git.createBlob({
        owner, repo,
        content: Buffer.from(c.content).toString("base64"),
        encoding: "base64",
      });
      return { path: c.path, sha: data.sha };
    })
  );

  const { data: newTree } = await octokit.git.createTree({
    owner, repo,
    base_tree: baseTreeSha,
    tree: blobShas.map(b => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner, repo, message,
    tree: newTree.sha,
    parents: [latestSha],
  });

  await octokit.git.updateRef({ owner, repo, ref: "heads/main", sha: newCommit.sha });
  return newCommit.sha;
}

export async function testGitHubConnection(): Promise<{ ok: boolean; login?: string; error?: string }> {
  try {
    const octokit = await getClient();
    const { data } = await octokit.users.getAuthenticated();
    return { ok: true, login: data.login };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Connection failed" };
  }
}
