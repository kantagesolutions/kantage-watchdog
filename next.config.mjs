const nextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "node-ssh",
    "nodemailer",
    "@octokit/rest",
    "@anthropic-ai/sdk",
    "openai",
  ],
};

export default nextConfig;
