## Prerequisites

- **JMRI** installed
  - macOS default: `/Applications/JMRI`
  - Raspberry Pi default: `/home/pi/JMRI`
- **Java 11** (JMRI 5.x builds target Java 11)
- **Node.js 18+** (recommended LTS 20+) for the web app
- **Build tools**:
  - macOS: Xcode CLT or Homebrew coreutils (optional)
  - Linux/RPi: `bash`, `find`, `jar` (from JDK)

---

## Setup & Build (Java)

From `jmri-easy-ui/server`:

```bash
# 1) Point to your JMRI install directory
export JMRI_HOME="/Applications/JMRI"        # macOS
export JMRI_HOME="/home/pi/JMRI"           # Raspberry Pi

# 2) Build
./build.sh
```

The script compiles sources against JMRI’s jars and emits:

```
server/dist/jmri-easy-ui-server.jar
```

**Install the JAR** into JMRI:

```bash
# macOS
cp server/dist/jmri-easy-ui-server.jar "/Applications/JMRI/lib/"

# Raspberry Pi
cp server/dist/jmri-easy-ui-server.jar "/home/pi/JMRI/lib/"
```

Then **restart JMRI**.

> If you prefer manual compilation, the script mirrors:
> ```bash
> javac --release 11 \
>   -cp "$JMRI_HOME/*:$JMRI_HOME/lib/*" \
>   -d build/classes $(find src/main/java -type f -name '*.java')
> cp -r src/main/resources/* build/classes/
> jar cf "dist/jmri-easy-ui-server.jar" -C build/classes .
> ```

---

## Setup & Build (Web)

From `jmri-easy-ui/web`:

```bash
# 1) Install deps
npm ci

# 2) Lint
npm run lint

# 3) Dev server (optional)
npm run dev
# → http://localhost:5173 (vite dev server)

# 4) Build
npm run build
# → outputs to web/dist
```

You can either:
- Serve the **source** folder directly via JMRI (see config below), _or_
- Build with Vite and serve the **compiled** `web/dist` folder for best performance.