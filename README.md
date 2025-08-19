# Colombos 🐧  
*A lightweight Kubernetes dashboard for WSL and beyond.*

Colombos is a minimal dashboard that connects directly to your existing `kubectl` context(s) and gives you an overview of your Kubernetes clusters:  
- Context, API server, version, CRDs  
- Node health  
- Top namespaces by pods  
- Deployments, StatefulSets, DaemonSets, Services, PVCs, …  

Built with **Next.js + TypeScript + @kubernetes/client-node**.

---

## 🚀 Quick Start

### 1. Clone & enter
```bash
git clone https://github.com/your-org/colombos.git
cd colombos
```

### 2. Install deps
```bash
npm install
```

### 3. Build & run
```bash
npm run build
npm start
```

App runs on:  
👉 http://localhost:3000

---

## 🐚 Run like a CLI app

To run Colombos as a terminal command (`colombos`), create a wrapper script:

```bash
mkdir -p ~/.local/bin

cat > ~/.local/bin/colombos <<'EOF'
#!/usr/bin/env bash
APP_DIR="$HOME/colombos" # <--- update this if needed

cd "$APP_DIR" || exit 1
if [ ! -d .next ]; then
  echo "🏗️  Building Colombos..."
  npm run build
fi

echo "🚀 Starting Colombos on http://localhost:3000"
npm start
EOF

chmod +x ~/.local/bin/colombos
```

Make sure `~/.local/bin` is in your `$PATH` (add to `~/.bashrc` or `~/.zshrc` if needed):

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Now you can just run:

```bash
colombos
```

---

## 🛠️ Development

For hot reload during dev:

```bash
npm run dev
```

Then open http://localhost:3000.

---

## ⚡ Features

- Dark mode UI
- Search & filter cluster contexts
- Charts for nodes and namespaces
- Automatic detection of `kubectl` contexts (`~/.kube/config`)
- Works inside **WSL**, Linux, macOS

---

## 📦 Tech Stack

- [Next.js](https://nextjs.org/) 14
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Recharts](https://recharts.org/)
- [@kubernetes/client-node](https://github.com/kubernetes-client/javascript)

---

## 🧩 Roadmap (Coming Next)

- [ ] RBAC-aware view (only show accessible resources)  
- [ ] Context favorites / pinning  
- [ ] Logs & events  
- [ ] YAML viewer/editor  
