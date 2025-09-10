package dev.yourname.jmri.easy;

import dev.yourname.jmri.easy.util.JsonUtil;
import jmri.GlobalProgrammerManager;
import jmri.InstanceManager;
import jmri.ProgListener;
import jmri.Programmer;
import org.openide.util.lookup.ServiceProvider;

import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * ReadFromTrackServlet
 * --------------------
 * GET /api/jmri/read
 *
 * Flexible reader for service-mode (programming track):
 *
 * Query params:
 *   list       Comma-separated CVs and ranges (e.g. "1,7,8,17,18,29,33-46").
 *              If omitted and 'all' is not set, a sensible default is used: 1,7,8,17,18,19,29.
 *   all        If "1", expands to 1-1024 (raw dump; will be slow).
 *   timeoutMs  Per-CV timeout (default 4000; min 500; max 15000).
 *   attempts   Retries per CV (default 3; min 1; max 5).
 *
 * Response:
 *   {
 *     "ok": true,
 *     "values": { "1": 3, "7": 81, "8": 141, "17": 211, "18": 231, "29": 50, ... },
 *     "derived": { "address":"5095", "addressMode":"long" },   // present if computable
 *     "warnings": [ "CV33: timed out after …ms", ... ]         // optional
 *   }
 */
@WebServlet(name = "EasyJmriRead", urlPatterns = {"/api/jmri/read"})
@ServiceProvider(service = HttpServlet.class)
public class ReadFromTrackServlet extends HttpServlet {

  private static final int DEFAULT_TIMEOUT_MS = 4000;
  private static final int DEFAULT_ATTEMPTS   = 3;

  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    // ---- Parse query --------------------------------------------------------
    final boolean readAll = "1".equals(Optional.ofNullable(req.getParameter("all")).orElse(""));
    final String listParam = Optional.ofNullable(req.getParameter("list")).orElse("").trim();
    final int timeoutMs = clamp(parseInt(req.getParameter("timeoutMs"), DEFAULT_TIMEOUT_MS), 500, 15000);
    final int attempts  = clamp(parseInt(req.getParameter("attempts"),  DEFAULT_ATTEMPTS), 1, 5);

    // Decide which CVs to read
    final List<Integer> cvsToRead;
    try {
      if (readAll) {
        cvsToRead = range(1, 1024);
      } else if (!listParam.isEmpty()) {
        cvsToRead = parseCvList(listParam);
      } else {
        // sensible default: identity + addressing + consist + core options
        cvsToRead = Arrays.asList(1, 7, 8, 17, 18, 19, 29);
      }
    } catch (IllegalArgumentException bad) {
      JsonUtil.err(resp, 400, "Bad 'list' syntax: " + bad.getMessage());
      return;
    }

    // ---- Programmer ---------------------------------------------------------
    final Programmer programmer;
    try {
      GlobalProgrammerManager gpm = InstanceManager.getNullableDefault(GlobalProgrammerManager.class);
      if (gpm == null) throw new IllegalStateException("No GlobalProgrammerManager available.");
      programmer = gpm.getGlobalProgrammer();
      if (programmer == null) throw new IllegalStateException("No Global Programmer present.");
    } catch (IllegalStateException notReady) {
      JsonUtil.err(resp, 503, "Programming track not available: " + notReady.getMessage());
      return;
    }

    // ---- Read loop ----------------------------------------------------------
    Map<Integer, Integer> values = new LinkedHashMap<>();
    List<String> warnings = new ArrayList<>();

    for (int cv : cvsToRead) {
      try {
        int v = readCvWithRetries(programmer, cv, timeoutMs, attempts);
        values.put(cv, v);
      } catch (RuntimeException ex) {
        warnings.add("CV" + cv + ": " + ex.getMessage());
      }
    }

    // ---- Derived info (address/addressMode if we can compute it) ------------
    Map<String, String> derived = deriveAddress(values);

    // ---- Build JSON ---------------------------------------------------------
    StringBuilder json = new StringBuilder(512 + 8 * values.size());
    json.append('{');
    appendBool(json, "ok", true);

    // values {}
    json.append("\"values\":{");
    for (Map.Entry<Integer,Integer> e : values.entrySet()) {
      json.append('"').append(e.getKey()).append('"').append(':').append(e.getValue()).append(',');
    }
    if (json.charAt(json.length()-1) == ',') json.setLength(json.length()-1);
    json.append("},");

    // derived {}
    if (!derived.isEmpty()) {
      json.append("\"derived\":{");
      for (Map.Entry<String,String> e : derived.entrySet()) {
        appendString(json, e.getKey(), e.getValue(), true);
      }
      if (json.charAt(json.length()-1) == ',') json.setLength(json.length()-1);
      json.append("},");
    }

    // warnings []
    if (!warnings.isEmpty()) {
      json.append("\"warnings\":[");
      for (String w : warnings) {
        json.append('"').append(escape(w)).append('"').append(',');
      }
      if (json.charAt(json.length()-1) == ',') json.setLength(json.length()-1);
      json.append("],");
    }

    // trim trailing comma & close
    if (json.charAt(json.length()-1) == ',') json.setLength(json.length()-1);
    json.append('}');

    JsonUtil.ok(resp, json.toString());
  }

  /* ======================= helpers ======================= */

  private static List<Integer> parseCvList(String list) {
    List<Integer> out = new ArrayList<>();
    String[] parts = list.split(",");
    for (String p : parts) {
      String s = p.trim();
      if (s.isEmpty()) continue;
      if (s.contains("-")) {
        String[] ab = s.split("-", 2);
        int a = Integer.parseInt(ab[0].trim());
        int b = Integer.parseInt(ab[1].trim());
        if (a < 1 || b < 1 || a > 1024 || b > 1024 || b < a) {
          throw new IllegalArgumentException("range " + s);
        }
        out.addAll(range(a, b));
      } else {
        int n = Integer.parseInt(s);
        if (n < 1 || n > 1024) throw new IllegalArgumentException("cv " + n);
        out.add(n);
      }
    }
    // de-dup preserving order
    LinkedHashSet<Integer> set = new LinkedHashSet<>(out);
    return new ArrayList<>(set);
  }

  private static List<Integer> range(int a, int b) {
    ArrayList<Integer> out = new ArrayList<>(Math.max(0, b - a + 1));
    for (int i = a; i <= b; i++) out.add(i);
    return out;
  }

  private static int readCvWithRetries(Programmer p, int cv, int timeoutMs, int attempts) {
    RuntimeException last = null;
    int tries = Math.max(1, attempts);
    for (int i = 0; i < tries; i++) {
      try {
        return readCvSync(p, cv, timeoutMs);
      } catch (RuntimeException ex) {
        last = ex;
        try { Thread.sleep(120L); } catch (InterruptedException ie) {
          Thread.currentThread().interrupt();
          throw new RuntimeException("interrupted while retrying", ie);
        }
      }
    }
    throw (last != null) ? last : new RuntimeException("unknown failure");
  }

  private static int readCvSync(Programmer p, int cvNumber, int timeoutMs) {
    final CountDownLatch latch = new CountDownLatch(1);
    final int[] out = new int[]{ -1 };
    final String cv = String.valueOf(cvNumber);

    try {
      p.readCV(cv, new ProgListener() {
        @Override public void programmingOpReply(int value, int status) {
          if (status == ProgListener.OK) out[0] = value & 0xFF;
          else out[0] = -2;
          latch.countDown();
        }
      });
    } catch (Exception ex) {
      throw new RuntimeException("dispatch failed: " + ex.getMessage(), ex);
    }

    try {
      if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) {
        throw new RuntimeException("timed out after " + timeoutMs + "ms");
      }
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("interrupted", ie);
    }

    if (out[0] == -2) throw new RuntimeException("decoder error");
    if (out[0] < 0)  throw new RuntimeException("no result");
    return out[0];
  }

  private static Map<String, String> deriveAddress(Map<Integer,Integer> values) {
    Map<String,String> d = new LinkedHashMap<>();
    Integer cv29 = values.get(29);
    if (cv29 == null) return d;

    boolean longAddr = ((cv29 >> 5) & 1) == 1;
    if (longAddr) {
      Integer cv17 = values.get(17);
      Integer cv18 = values.get(18);
      if (cv17 != null && cv18 != null) {
        int addr = ((cv17 & 0x3F) << 8) | (cv18 & 0xFF);
        d.put("address", String.valueOf(addr));
        d.put("addressMode", "long");
      }
    } else {
      Integer cv1 = values.get(1);
      if (cv1 != null) {
        d.put("address", String.valueOf(cv1));
        d.put("addressMode", "short");
      }
    }
    return d;
  }

  private static int parseInt(String s, int def) {
    try { return (s == null || s.isEmpty()) ? def : Integer.parseInt(s); }
    catch (NumberFormatException n) { return def; }
  }
  private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }

  private static void appendString(StringBuilder sb, String name, String value, boolean required) {
    if (!required && (value == null || value.isEmpty())) return;
    sb.append('"').append(escape(name)).append('"').append(':')
      .append('"').append(escape(value == null ? "" : value)).append('"').append(',');
  }
  private static void appendBool(StringBuilder sb, String name, boolean value) {
    sb.append('"').append(escape(name)).append('"').append(':').append(value).append(',');
  }
  private static String escape(String s) {
    if (s == null) return "";
    return s.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
