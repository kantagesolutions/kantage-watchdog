import { NodeSSH } from "node-ssh";
import { getSetting } from "./settings";

const HOST_KEYS: Record<string, string> = {
  hub: "HUB_SERVER_HOST",
  builder: "BUILDER_SERVER_HOST",
  deploy: "DEPLOY_SERVER_HOST",
};

async function getServerConfig(service: string): Promise<{ host: string; username: string }> {
  const hostKey = HOST_KEYS[service];
  if (!hostKey) throw new Error(`Unknown service: ${service}`);
  const [host, username] = await Promise.all([
    getSetting(hostKey),
    getSetting("SSH_USERNAME", "root"),
  ]);
  return { host, username };
}

async function getPrivateKey(): Promise<string> {
  const key = await getSetting("WATCHDOG_SSH_KEY");
  if (!key) throw new Error("WATCHDOG_SSH_KEY is not configured. Add it in Settings → SSH.");
  return key.replace(/\\n/g, "\n");
}

async function connect(service: string): Promise<NodeSSH> {
  const cfg = await getServerConfig(service);
  if (!cfg.host) throw new Error(`SSH host not configured for ${service}. Add it in Settings → SSH.`);
  const ssh = new NodeSSH();
  await ssh.connect({ host: cfg.host, username: cfg.username, privateKey: await getPrivateKey(), readyTimeout: 15000 });
  return ssh;
}

async function logAction(service: string, command: string, result: { stdout: string; stderr: string; code: number } | null, error?: string): Promise<void> {
  try {
    const { prisma } = await import("./prisma");
    await prisma.sshLog.create({
      data: {
        service,
        command: command.slice(0, 500),
        stdout: result?.stdout?.slice(0, 2000),
        stderr: result?.stderr?.slice(0, 1000),
        exitCode: result?.code,
        error: error?.slice(0, 500),
      },
    });
  } catch {
    // Non-critical
  }
}

export async function runCommand(service: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const ssh = await connect(service);
  try {
    const result = await ssh.execCommand(cmd, { execOptions: { pty: false } });
    const out = { stdout: result.stdout, stderr: result.stderr, code: result.code ?? 0 };
    await logAction(service, cmd, out);
    return out;
  } catch (e: any) {
    await logAction(service, cmd, null, e?.message);
    throw e;
  } finally {
    ssh.dispose();
  }
}

export async function getDockerLogs(service: string, containerName: string, lines = 100): Promise<string> {
  const { stdout, stderr } = await runCommand(service, `docker logs --tail ${lines} ${containerName} 2>&1`);
  return stdout || stderr || "(no output)";
}

export async function getRunningContainers(service: string): Promise<string> {
  const { stdout } = await runCommand(service, `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"`);
  return stdout || "(no containers)";
}

export async function restartContainer(service: string, containerName: string): Promise<string> {
  const { stdout, stderr } = await runCommand(service, `docker restart ${containerName}`);
  return stdout || stderr;
}

export async function rebuildContainer(service: string, composeDir: string): Promise<string> {
  const { stdout, stderr } = await runCommand(
    service,
    `cd ${composeDir} && docker compose pull && docker compose up -d --force-recreate 2>&1`
  );
  return stdout + "\n" + stderr;
}
