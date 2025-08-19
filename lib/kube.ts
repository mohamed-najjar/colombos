import os from 'os';
import path from 'path';
import fs from 'fs';
import * as k8s from '@kubernetes/client-node';
import { spawnSync } from 'child_process';

const DEFAULT_KUBECONFIG =
  process.env.KUBECONFIG_PATH || path.join(os.homedir(), '.kube', 'config');

// Ensure common WSL bin paths are in PATH so kubeconfig `exec` (e.g., tcli) can spawn
(function ensureExecPath() {
  const home = os.homedir();
  const extraBins = [
    path.join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ];
  const existing = process.env.PATH ?? '';
  const parts = existing.split(':');
  const toAdd = extraBins.filter((p) => fs.existsSync(p) && !parts.includes(p));
  if (toAdd.length) {
    process.env.PATH = `${existing}${existing ? ':' : ''}${toAdd.join(':')}`;
  }
})();

function execJson(cmd: string, args: string[], kubeconfigPath: string) {
  const res = spawnSync(cmd, args, {
    env: { ...process.env, KUBECONFIG: kubeconfigPath },
    encoding: 'utf-8',
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = res.stderr || res.stdout || `exit ${res.status}`;
    throw new Error(`${cmd} ${args.join(' ')} failed: ${msg}`);
  }
  return JSON.parse(res.stdout || '{}');
}

export function loadKubeConfig(filePath: string = DEFAULT_KUBECONFIG) {
  const kc = new k8s.KubeConfig();
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`kubeconfig not found or empty at ${filePath}`);
  }
  kc.loadFromFile(filePath);
  // attach resolved path for fallbacks
  (kc as any).__path = filePath;
  return kc;
}

export function getContexts() {
  const kc = loadKubeConfig();
  const contexts = kc.getContexts();
  const current = kc.getCurrentContext();
  return { contexts, current };
}

export function makeClientForContext(contextName?: string) {
  const kc = loadKubeConfig();
  if (contextName) {
    const ctx = kc.getContexts().find((c) => c.name === contextName);
    if (!ctx) throw new Error(`Context not found: ${contextName}`);
    kc.setCurrentContext(contextName);
  }
  const core = kc.makeApiClient(k8s.CoreV1Api);
  const apps = kc.makeApiClient(k8s.AppsV1Api);
  const net = kc.makeApiClient(k8s.NetworkingV1Api);
  const storage = kc.makeApiClient(k8s.StorageV1Api);
  const custom = kc.makeApiClient(k8s.CustomObjectsApi);
  const version = kc.makeApiClient((k8s as any).VersionApi) as any;
  const apiExt = kc.makeApiClient(k8s.ApiextensionsV1Api);   // ← add this
  return { kc, core, apps, net, storage, custom, version, apiExt };
}

export type ClusterSummary = {
  context: string;
  clusterServer?: string;
  user?: string;
  namespace?: string;
  version?: {
    gitVersion?: string;
    platform?: string;
    major?: string;
    minor?: string;
  };
  nodes: {
    total: number;
    ready: number;
    notReady: number;
    items: Array<{
      name: string;
      roles: string[];
      kubeletVersion: string;
      osImage?: string;
      containerRuntime?: string;
      cpu?: string;
      memory?: string;
    }>;
  };
  namespaces: {
    total: number;
    topByPods: Array<{ namespace: string; pods: number }>;
  };
  workloads: {
    deployments: number;
    statefulsets: number;
    daemonsets: number;
    pods: number;
    services: number;
    ingresses: number;
  };
  storage: {
    storageClasses: number;
    persistentVolumes: number;
    persistentVolumeClaims: number;
  };
  crds: number;

  // Optional detailed lists (only when `detail` is true)
  details?: {
    pods: Array<{ name: string; namespace: string; phase?: string }>;
    deployments: Array<{ name: string; namespace: string; ready?: string; replicas?: number }>;
    services: Array<{ name: string; namespace: string; type?: string; clusterIP?: string }>;
    ingresses: Array<{ name: string; namespace: string; hosts: string[] }>;
    pvcs: Array<{ name: string; namespace: string; status?: string; storageClass?: string; capacity?: string }>;
  };
};

function pickSettledError(...results: PromiseSettledResult<any>[]) {
  for (const r of results) {
    if (r.status === 'rejected') return (r as PromiseRejectedResult).reason;
  }
  return undefined;
}

export async function buildSummary(
  contextName?: string,
  detail = false
): Promise<ClusterSummary> {
  const { kc, core, apps, net, storage, custom, version, apiExt } =
    makeClientForContext(contextName);
  const currentCtx = kc.getCurrentContext();
  const cur = kc.getContexts().find((c) => c.name === currentCtx);
  const clusterServer = kc.getCurrentCluster()?.server;
  const user = cur?.user;
  const namespace = cur?.namespace;

  const [
    versionResp,
    nodesResp,
    nsResp,
    podsResp,
    deployResp,
    stsResp,
    dsResp,
    svcResp,
    ingResp,
    scResp,
    pvResp,
    pvcResp,
    crdResp,
  ] = await Promise.allSettled([
    (version as any)?.getCode?.(), // { body: { gitVersion, platform, ... } }
    core.listNode(),
    core.listNamespace(),
    core.listPodForAllNamespaces(),
    apps.listDeploymentForAllNamespaces(),
    apps.listStatefulSetForAllNamespaces(),
    apps.listDaemonSetForAllNamespaces(),
    core.listServiceForAllNamespaces(),
    net.listIngressForAllNamespaces().catch(async () => ({ body: { items: [] } } as any)),
    storage.listStorageClass(),
    core.listPersistentVolume(),
    core.listPersistentVolumeClaimForAllNamespaces(),
    apiExt.listCustomResourceDefinition(),
  ]);

  // Fail early on critical API issues (otherwise UI shows zeros)
  const criticalErr = pickSettledError(versionResp, nodesResp);
  if (criticalErr) {
    const body =
      (criticalErr?.response?.body && JSON.stringify(criticalErr.response.body)) ||
      criticalErr?.message ||
      String(criticalErr);
    throw new Error(`Cluster API request failed: ${body}`);
  }

  const toOk = <T,>(p: PromiseSettledResult<T>) =>
    p.status === 'fulfilled' ? (p as PromiseFulfilledResult<T>).value : undefined;
  const unwrap = <T = any>(x: any): T => (x && typeof x === 'object' && 'body' in x ? x.body : x);
  
// Prefer client-node values (support both {body: ...} and direct objects)
let ver = unwrap<any>(toOk(versionResp));

let nodes = unwrap<any>(toOk(nodesResp))?.items ?? [];
let namespaces = unwrap<any>(toOk(nsResp))?.items ?? [];
let pods = unwrap<any>(toOk(podsResp))?.items ?? [];
let deployments = unwrap<any>(toOk(deployResp))?.items ?? [];
let statefulsets = unwrap<any>(toOk(stsResp))?.items ?? [];
let daemonsets = unwrap<any>(toOk(dsResp))?.items ?? [];
let services = unwrap<any>(toOk(svcResp))?.items ?? [];
let ingresses = unwrap<any>(toOk(ingResp))?.items ?? [];
let storageClasses = unwrap<any>(toOk(scResp))?.items ?? [];
let pvs = unwrap<any>(toOk(pvResp))?.items ?? [];
let pvcs = unwrap<any>(toOk(pvcResp))?.items ?? [];
let crds = unwrap<any>(toOk(crdResp))?.items ?? [];

  // --- Fallbacks via kubectl if the client returned nothing (common with exec-auth issues) ---
  const kubePath = (kc as any).__path as string;

  try {
    if (!ver) {
      const j = execJson('kubectl', ['version', '-o', 'json'], kubePath);
      ver = j.serverVersion || undefined;
    }
  } catch {}

  try {
    if (nodes.length === 0) {
      const j = execJson('kubectl', ['get', 'nodes', '-o', 'json'], kubePath);
      nodes = j.items || [];
    }
  } catch {}

  try {
    if (namespaces.length === 0) {
      const j = execJson('kubectl', ['get', 'namespaces', '-o', 'json'], kubePath);
      namespaces = j.items || [];
    }
  } catch {}

  try {
    if (pods.length === 0) {
      const j = execJson('kubectl', ['get', 'pods', '--all-namespaces', '-o', 'json'], kubePath);
      pods = j.items || [];
    }
  } catch {}

  try {
    if (deployments.length === 0) {
      const j = execJson('kubectl', ['get', 'deployments', '--all-namespaces', '-o', 'json'], kubePath);
      deployments = j.items || [];
    }
  } catch {}

  try {
    if (statefulsets.length === 0) {
      const j = execJson('kubectl', ['get', 'statefulsets', '--all-namespaces', '-o', 'json'], kubePath);
      statefulsets = j.items || [];
    }
  } catch {}

  try {
    if (daemonsets.length === 0) {
      const j = execJson('kubectl', ['get', 'daemonsets', '--all-namespaces', '-o', 'json'], kubePath);
      daemonsets = j.items || [];
    }
  } catch {}

  try {
    if (services.length === 0) {
      const j = execJson('kubectl', ['get', 'services', '--all-namespaces', '-o', 'json'], kubePath);
      services = j.items || [];
    }
  } catch {}

  try {
    if (ingresses.length === 0) {
      const j = execJson('kubectl', ['get', 'ingresses', '--all-namespaces', '-o', 'json'], kubePath);
      ingresses = j.items || [];
    }
  } catch {}

  try {
    if (storageClasses.length === 0) {
      const j = execJson('kubectl', ['get', 'storageclass', '-o', 'json'], kubePath);
      storageClasses = j.items || [];
    }
  } catch {}

  try {
    if (pvs.length === 0) {
      const j = execJson('kubectl', ['get', 'pv', '-o', 'json'], kubePath);
      pvs = j.items || [];
    }
  } catch {}

  try {
    if (pvcs.length === 0) {
      const j = execJson('kubectl', ['get', 'pvc', '--all-namespaces', '-o', 'json'], kubePath);
      pvcs = j.items || [];
    }
  } catch {}

  try {
    if (crds.length === 0) {
      const j = execJson('kubectl', ['get', 'crd', '-o', 'json'], kubePath);
      crds = j.items || [];
    }
  } catch {}

  // Build node table + counts
  const nodeItems = nodes.map((n: any) => ({
    name: n.metadata?.name || 'unknown',
    roles: Object.entries(n.metadata?.labels || {})
      .filter(([k]) => (k as string).startsWith('node-role.kubernetes.io'))
      .map(([k]) => (k as string).split('/')[1] || 'role'),
    kubeletVersion: n.status?.nodeInfo?.kubeletVersion || 'unknown',
    osImage: n.status?.nodeInfo?.osImage,
    containerRuntime: n.status?.nodeInfo?.containerRuntimeVersion,
    cpu: n.status?.capacity?.['cpu'],
    memory: n.status?.capacity?.['memory'],
  }));

  const readyCount = nodes.filter((n: any) =>
    (n.status?.conditions || []).some((c: any) => c.type === 'Ready' && c.status === 'True'),
  ).length;

  // Pods per namespace (for chart)
  const podsByNs: Record<string, number> = {};
  for (const p of pods) {
    const ns = (p as any).metadata?.namespace || 'default';
    podsByNs[ns] = (podsByNs[ns] || 0) + 1;
  }
  const topByPods = Object.entries(podsByNs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ns, count]) => ({ namespace: ns, pods: count }));

  const summary: ClusterSummary = {
    context: currentCtx,
    clusterServer,
    user,
    namespace,
    version: ver ?? undefined,
    nodes: {
      total: nodes.length,
      ready: readyCount,
      notReady: Math.max(nodes.length - readyCount, 0),
      items: nodeItems,
    },
    namespaces: {
      total: namespaces.length,
      topByPods,
    },
    workloads: {
      deployments: deployments.length,
      statefulsets: statefulsets.length,
      daemonsets: daemonsets.length,
      pods: pods.length,
      services: services.length,
      ingresses: ingresses.length,
    },
    storage: {
      storageClasses: storageClasses.length,
      persistentVolumes: pvs.length,
      persistentVolumeClaims: pvcs.length,
    },
    crds: crds.length,
  };

  if (detail) {
    summary.details = {
      pods: pods.slice(0, 500).map((p: any) => ({
        name: p.metadata?.name || 'unknown',
        namespace: p.metadata?.namespace || 'default',
        phase: p.status?.phase,
      })),
      deployments: deployments.slice(0, 500).map((d: any) => ({
        name: d.metadata?.name || 'unknown',
        namespace: d.metadata?.namespace || 'default',
        ready: `${d.status?.readyReplicas ?? 0}/${d.status?.replicas ?? 0}`,
        replicas: d.status?.replicas ?? 0,
      })),
      services: services.slice(0, 500).map((s: any) => ({
        name: s.metadata?.name || 'unknown',
        namespace: s.metadata?.namespace || 'default',
        type: s.spec?.type,
        clusterIP: s.spec?.clusterIP,
      })),
      ingresses: ingresses.slice(0, 500).map((i: any) => ({
        name: i.metadata?.name || 'unknown',
        namespace: i.metadata?.namespace || 'default',
        hosts: (i.spec?.rules || []).map((r: any) => r.host).filter(Boolean),
      })),
      pvcs: pvcs.slice(0, 500).map((c: any) => ({
        name: c.metadata?.name || 'unknown',
        namespace: c.metadata?.namespace || 'default',
        status: c.status?.phase,
        storageClass: c.spec?.storageClassName,
        capacity: c.status?.capacity?.storage,
      })),
    };
  }

  return summary;
}
