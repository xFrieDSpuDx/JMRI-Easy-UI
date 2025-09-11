package easy;

import easy.util.JsonUtil;
import easy.util.RosterUtil;

import jmri.InstanceManager;
import jmri.SystemConnectionMemo;

import jmri.PowerManager;
import jmri.TurnoutManager;
import jmri.SensorManager;
import jmri.LightManager;
import jmri.ThrottleManager;
import jmri.ReporterManager;
import jmri.MemoryManager;

import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;
import org.openide.util.lookup.ServiceProvider;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Connections REST API
 *
 * GET  /api/connections               → list current JMRI system connections
 * GET  /api/connections/active        → get the app-selected "active" connection
 * POST /api/connections/select        → set the app-selected "active" connection (by systemPrefix)
 * GET  /api/connections/types         → list simple "addable" connection templates (for UI)
 * POST /api/connections/add           → persist a request to add a new connection (restart usually required)
 *
 * Persisted settings live in: <roster folder>/easy-settings.json
 * {
 *   "activeSystemPrefix": "L",
 *   "pendingConnections": [
 *     { "type":"dcc-ex-serial", "props": { "port":"/dev/ttyUSB0", "baud":115200 } }
 *   ]
 * }
 */
@WebServlet(name = "EasyConnectionsApi", urlPatterns = { "/api/connections", "/api/connections/*" })
@ServiceProvider(service = HttpServlet.class)
public class ConnectionsApiServlet extends HttpServlet {

  // ---------- Router ----------

  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String path = normalize(req.getPathInfo());

    if (path.isEmpty() || "/".equals(path)) {
      listConnections(resp);
      return;
    }
    if ("/active".equals(path)) {
      getActiveConnection(resp);
      return;
    }
    if ("/types".equals(path)) {
      listAddableTypes(resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  @Override
  protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String path = normalize(req.getPathInfo());

    if ("/select".equals(path)) {
      selectActiveConnection(req, resp);
      return;
    }
    if ("/add".equals(path)) {
      addNewConnectionRequest(req, resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  private static String normalize(String path) {
    if (path == null) return "";
    while (path.endsWith("/") && path.length() > 1) path = path.substring(0, path.length() - 1);
    return path;
  }

  // ---------- GET /api/connections ----------

  /** List all live JMRI connections with basic capability flags. */
  private void listConnections(HttpServletResponse resp) throws IOException {
    List<SystemConnectionMemo> memos = new ArrayList<>(InstanceManager.getList(SystemConnectionMemo.class));

    // Sort stable: by userName, then systemPrefix
    memos.sort(Comparator
        .comparing((SystemConnectionMemo m) -> n(m.getUserName()))
        .thenComparing(m -> n(m.getSystemPrefix())));

    String activePrefix = n(loadSettings().activeSystemPrefix);

    StringBuilder json = new StringBuilder(256 + memos.size() * 256);
    json.append("[");

    boolean first = true;
    for (SystemConnectionMemo memo : memos) {
      if (!first) json.append(',');
      first = false;

      String systemPrefix = n(memo.getSystemPrefix());
      String userName = n(memo.getUserName());
      String impl = memo.getClass().getSimpleName();

      boolean hasPower      = memo.provides(PowerManager.class);
      boolean hasTurnouts   = memo.provides(TurnoutManager.class);
      boolean hasSensors    = memo.provides(SensorManager.class);
      boolean hasLights     = memo.provides(LightManager.class);
      boolean hasThrottles  = memo.provides(ThrottleManager.class);
      boolean hasReporters  = memo.provides(ReporterManager.class);
      boolean hasMemories   = memo.provides(MemoryManager.class);

      json.append("{")
          .append("\"systemPrefix\":").append(JsonUtil.quote(systemPrefix))
          .append(",\"userName\":").append(JsonUtil.quote(userName))
          .append(",\"implementation\":").append(JsonUtil.quote(impl))
          .append(",\"capabilities\":{")
            .append("\"power\":").append(hasPower)
            .append(",\"turnouts\":").append(hasTurnouts)
            .append(",\"sensors\":").append(hasSensors)
            .append(",\"lights\":").append(hasLights)
            .append(",\"throttles\":").append(hasThrottles)
            .append(",\"reporters\":").append(hasReporters)
            .append(",\"memories\":").append(hasMemories)
          .append("}")
          .append(",\"active\":").append(systemPrefix.equals(activePrefix))
          .append("}");
    }
    json.append("]");
    JsonUtil.ok(resp, json.toString());
  }

  // ---------- GET /api/connections/active ----------

  private void getActiveConnection(HttpServletResponse resp) throws IOException {
    Settings s = loadSettings();
    JsonUtil.ok(resp, "{\"activeSystemPrefix\":" + JsonUtil.quote(n(s.activeSystemPrefix)) + "}");
  }

  // ---------- POST /api/connections/select ----------

  /** Set the app's "active" connection by systemPrefix (must exist). */
  private void selectActiveConnection(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String systemPrefix = opt(req, "systemPrefix");
    if (systemPrefix.isEmpty()) {
      JsonUtil.err(resp, 400, "missing systemPrefix");
      return;
    }

    boolean exists = InstanceManager.getList(SystemConnectionMemo.class).stream()
        .map(m -> n(m.getSystemPrefix()))
        .anyMatch(p -> p.equals(systemPrefix));

    if (!exists) {
      JsonUtil.err(resp, 404, "systemPrefix not found: " + systemPrefix);
      return;
    }

    Settings s = loadSettings();
    s.activeSystemPrefix = systemPrefix;
    saveSettings(s);

    JsonUtil.ok(resp, "{\"ok\":true,\"activeSystemPrefix\":" + JsonUtil.quote(systemPrefix) + "}");
  }

  // ---------- GET /api/connections/types ----------

  /**
   * Simple set of addable "templates" for the UI.
   * You can expand this list over time or even fetch dynamically from JMRI.
   */
  private void listAddableTypes(HttpServletResponse resp) throws IOException {
    // Minimal curated set that are common in the field; properties are what the UI should collect.
    String payload = "["
        + "{\"type\":\"dcc-ex-serial\",\"label\":\"DCC-EX (DCC++) over Serial\",\"properties\":["
        + "  {\"key\":\"port\",\"label\":\"Serial Port\",\"hint\":\"/dev/ttyUSB0 or COM3\"},"
        + "  {\"key\":\"baud\",\"label\":\"Baud Rate\",\"hint\":\"115200\"}"
        + "]},"
        + "{\"type\":\"loconet-tcp\",\"label\":\"LocoNet over TCP\",\"properties\":["
        + "  {\"key\":\"host\",\"label\":\"Host\",\"hint\":\"192.168.1.50\"},"
        + "  {\"key\":\"port\",\"label\":\"Port\",\"hint\":\"1234\"}"
        + "]}"
        + "]";
    JsonUtil.ok(resp, payload);
  }

  // ---------- POST /api/connections/add ----------

  /**
   * Persist a request to add a connection.
   * We do not try to instantiate the hardware connection live here because most
   * JMRI connection types initialize subsystems and often require restart.
   *
   * Form fields (x-www-form-urlencoded or multipart):
   * - type: one of listAddableTypes() (e.g. "dcc-ex-serial", "loconet-tcp")
   * - props[<key>]=<value> ... (e.g. props[port]=/dev/ttyUSB0&props[baud]=115200)
   *
   * Returns: { ok:true, pendingCount:N, requiresRestart:true }
   */
  private void addNewConnectionRequest(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String type = opt(req, "type");
    if (type.isEmpty()) {
      JsonUtil.err(resp, 400, "missing type");
      return;
    }

    // Collect props[...] form params into a map
    Map<String,String[]> paramMap = req.getParameterMap();
    Map<String, String> props = new LinkedHashMap<>();
    for (Map.Entry<String,String[]> e : paramMap.entrySet()) {
      String key = e.getKey();
      if (key.startsWith("props[")) {
        int end = key.indexOf(']');
        if (end > 6) {
          String propKey = key.substring(6, end);
          String value = firstNonEmpty(e.getValue());
          if (value != null) props.put(propKey, value);
        }
      }
    }

    // Basic validation based on known templates
    List<String> missing = new ArrayList<>();
    if ("dcc-ex-serial".equals(type)) {
      if (!props.containsKey("port") || props.get("port").trim().isEmpty()) missing.add("port");
      if (!props.containsKey("baud") || props.get("baud").trim().isEmpty()) missing.add("baud");
    } else if ("loconet-tcp".equals(type)) {
      if (!props.containsKey("host") || props.get("host").trim().isEmpty()) missing.add("host");
      if (!props.containsKey("port") || props.get("port").trim().isEmpty()) missing.add("port");
    }
    if (!missing.isEmpty()) {
      JsonUtil.err(resp, 400, "missing properties: " + String.join(", ", missing));
      return;
    }

    // Persist to easy-settings.json → pendingConnections[]
    Settings s = loadSettings();
    if (s.pendingConnections == null) s.pendingConnections = new ArrayList<>();

    PendingConnection pc = new PendingConnection();
    pc.type = type;
    pc.props = props;
    s.pendingConnections.add(pc);

    saveSettings(s);

    String out = "{"
        + "\"ok\":true,"
        + "\"requiresRestart\":true,"
        + "\"pendingCount\":" + s.pendingConnections.size()
        + "}";
    JsonUtil.ok(resp, out);
  }

  // ---------- Settings persistence ----------

  private static class Settings {
    String activeSystemPrefix;
    List<PendingConnection> pendingConnections;
  }

  private static class PendingConnection {
    String type;
    Map<String, String> props;
  }

  /** Read easy-settings.json from the roster folder (create defaults if missing). */
  private Settings loadSettings() {
    File f = settingsFile();
    if (!f.exists()) return new Settings();
    try {
      String json = Files.readString(f.toPath(), StandardCharsets.UTF_8);
      return parseSettings(json);
    } catch (Exception e) {
      return new Settings();
    }
  }

  /** Write easy-settings.json prettily. */
  private void saveSettings(Settings s) {
    try {
      String json = toJson(s);
      Files.writeString(settingsFile().toPath(), json, StandardCharsets.UTF_8);
    } catch (Exception ignore) {}
  }

  private File settingsFile() {
    // Keep it with the roster files for simplicity/single-profile
    return new File(RosterUtil.rosterFolder(), "easy-settings.json");
  }

  // Very tiny JSON (manual) to avoid extra deps:

  private Settings parseSettings(String json) {
    Settings s = new Settings();
    if (json == null) return s;

    // activeSystemPrefix
    String ap = extractJsonString(json, "\"activeSystemPrefix\"");
    if (ap != null) s.activeSystemPrefix = ap;

    // pendingConnections: extremely small parser (expects well-formed from our writer)
    int arrStart = json.indexOf("\"pendingConnections\"");
    if (arrStart >= 0) {
      int lbr = json.indexOf("[", arrStart);
      int rbr = json.indexOf("]", lbr);
      if (lbr > 0 && rbr > lbr) {
        String arr = json.substring(lbr + 1, rbr);
        s.pendingConnections = Arrays.stream(arr.split("\\},\\s*\\{"))
            .map(chunk -> chunk.trim())
            .filter(ch -> !ch.isEmpty())
            .map(ch -> {
              String obj = ch;
              if (!obj.startsWith("{")) obj = "{" + obj;
              if (!obj.endsWith("}")) obj = obj + "}";
              PendingConnection pc = new PendingConnection();
              pc.type = n(extractJsonString(obj, "\"type\""));
              pc.props = extractJsonObjectStrings(obj, "\"props\"");
              return pc;
            })
            .collect(Collectors.toList());
      }
    }
    return s;
  }

  private String toJson(Settings s) {
    StringBuilder sb = new StringBuilder(256);
    sb.append("{");
    sb.append("\"activeSystemPrefix\":").append(JsonUtil.quote(n(s.activeSystemPrefix)));
    sb.append(",\"pendingConnections\":[");
    if (s.pendingConnections != null) {
      boolean first = true;
      for (PendingConnection pc : s.pendingConnections) {
        if (!first) sb.append(',');
        first = false;
        sb.append("{\"type\":").append(JsonUtil.quote(n(pc.type))).append(",\"props\":{");
        if (pc.props != null) {
          boolean f2 = true;
          for (Map.Entry<String,String> e : pc.props.entrySet()) {
            if (!f2) sb.append(',');
            f2 = false;
            sb.append(JsonUtil.quote(e.getKey())).append(':').append(JsonUtil.quote(n(e.getValue())));
          }
        }
        sb.append("}}");
      }
    }
    sb.append("]}");
    return sb.toString();
  }

  private static String extractJsonString(String json, String key) {
    int i = json.indexOf(key);
    if (i < 0) return null;
    int c = json.indexOf(':', i);
    if (c < 0) return null;
    int q1 = json.indexOf('"', c + 1);
    if (q1 < 0) return null;
    int q2 = json.indexOf('"', q1 + 1);
    if (q2 < 0) return null;
    return json.substring(q1 + 1, q2);
  }

  private static Map<String,String> extractJsonObjectStrings(String json, String key) {
    Map<String,String> out = new LinkedHashMap<>();
    int i = json.indexOf(key);
    if (i < 0) return out;
    int c = json.indexOf(':', i);
    int l = json.indexOf('{', c);
    int r = json.indexOf('}', l);
    if (l < 0 || r < 0) return out;
    String body = json.substring(l + 1, r).trim();
    if (body.isEmpty()) return out;
    for (String kv : body.split(",")) {
      int colon = kv.indexOf(':');
      if (colon < 0) continue;
      String k = stripQuotes(kv.substring(0, colon).trim());
      String v = stripQuotes(kv.substring(colon + 1).trim());
      out.put(k, v);
    }
    return out;
  }

  private static String stripQuotes(String s) {
    if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) {
      return s.substring(1, s.length() - 1);
    }
    return s;
  }

  // ---------- Small utils ----------

  private static String n(String s) { return (s == null) ? "" : s; }

  private static String opt(HttpServletRequest req, String key) {
    String v = req.getParameter(key);
    return (v == null) ? "" : v.trim();
  }

  private static String firstNonEmpty(String[] arr) {
    if (arr == null) return null;
    for (String s : arr) if (s != null && !s.trim().isEmpty()) return s.trim();
    return null;
  }
}
