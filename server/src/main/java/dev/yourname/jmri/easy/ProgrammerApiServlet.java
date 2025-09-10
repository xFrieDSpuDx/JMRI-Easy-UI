package dev.yourname.jmri.easy;

import dev.yourname.jmri.easy.util.JsonUtil;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;

import java.io.IOException;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import jmri.InstanceManager;
import jmri.Programmer;
import jmri.GlobalProgrammerManager;
import jmri.AddressedProgrammerManager;
import jmri.AddressedProgrammer;
import jmri.ProgListener;
import org.openide.util.lookup.ServiceProvider;

/**
 * Minimal CV Read/Write API for JMRI.
 *
 * Endpoints
 * ---------
 * GET /api/jmri/read
 * Query:
 * list=CV[,CV...] e.g. "1,29" or "17,18,29"
 * mode=service|ops default service
 * address=<int> required for ops
 * long=true|false required for ops (addressing)
 * Response: { ok:true, values: { "1": 3, "29": 38 } }
 *
 * POST /api/jmri/write
 * Body (x-www-form-urlencoded):
 * mode=service|ops
 * address / long (ops only)
 * list=CV[,CV,...]
 * v[CV]=<int> one per CV in list
 * Response: { ok:true }
 *
 * POST /api/jmri/writeAddress (alias: /api/jmri/address)
 * Body (x-www-form-urlencoded):
 * mode=service|ops default service
 * newAddress=1..9999 REQUIRED — desired DCC address
 * address / long (ops only) current address & long flag to reach loco
 * Behavior:
 * - Reads CV29 to preserve other flags.
 * - For newAddress >= 128: writes CV17, CV18, sets CV29 bit 5.
 * - For newAddress <= 127: writes CV1, clears CV29 bit 5.
 * Response: { ok:true, wrote:{ "1":3, "29":6 } } or { ok:true, wrote:{
 * "17":196,"18":210,"29":38 } }
 */
@WebServlet(name = "EasyJmriApi", urlPatterns = { "/api/jmri", "/api/jmri/*" })
@ServiceProvider(service = HttpServlet.class)
public class ProgrammerApiServlet extends HttpServlet {

  // Tunables
  private static final long READ_TIMEOUT_MS = 6000;
  private static final long WRITE_TIMEOUT_MS = 7000;

  // --------------------------- Routing ---------------------------

  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String path = normalize(req.getPathInfo());
    if ("/read".equals(path)) {
      handleRead(req, resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  @Override
  protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String path = normalize(req.getPathInfo());
    if ("/write".equals(path)) {
      handleWrite(req, resp);
      return;
    }
    if ("/writeAddress".equals(path) || "/address".equals(path)) {
      handleWriteAddress(req, resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  private static String normalize(String p) {
    if (p == null || p.isEmpty())
      return "";
    if (p.endsWith("/"))
      p = p.substring(0, p.length() - 1);
    return p;
  }

  // --------------------------- Handlers ---------------------------

  private void handleRead(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    ModeSpec mode = parseMode(req);
    List<Integer> cvList = parseCvList(req.getParameter("list"));
    if (cvList.isEmpty()) {
      JsonUtil.err(resp, 400, "missing or empty 'list'");
      return;
    }

    Programmer programmer = getProgrammer(mode, resp);
    if (programmer == null)
      return;

    Map<String, Integer> values = new LinkedHashMap<>();
    try {
      for (int cv : cvList) {
        int val = readCv(programmer, cv, READ_TIMEOUT_MS);
        values.put(Integer.toString(cv), val);
      }
      JsonUtil.ok(resp, "{\"ok\":true,\"values\":" + toJsonMap(values) + "}");
    } catch (Exception ex) {
      JsonUtil.err(resp, 500, "read failed: " + ex.getMessage());
    }
  }

  private void handleWrite(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    ModeSpec mode = parseMode(req);
    List<Integer> cvList = parseCvList(req.getParameter("list"));
    if (cvList.isEmpty()) {
      JsonUtil.err(resp, 400, "missing or empty 'list'");
      return;
    }

    // Collect values: v[CV] = int
    Map<Integer, Integer> values = new LinkedHashMap<>();
    for (int cv : cvList) {
      String v = req.getParameter("v[" + cv + "]");
      if (v == null) {
        JsonUtil.err(resp, 400, "missing v[" + cv + "]");
        return;
      }
      try {
        int iv = Integer.parseInt(v.trim());
        if (iv < 0 || iv > 255) {
          JsonUtil.err(resp, 400, "v[" + cv + "] out of range 0..255");
          return;
        }
        values.put(cv, iv);
      } catch (NumberFormatException nfe) {
        JsonUtil.err(resp, 400, "invalid v[" + cv + "]");
        return;
      }
    }

    Programmer programmer = getProgrammer(mode, resp);
    if (programmer == null)
      return;

    try {
      for (Map.Entry<Integer, Integer> e : values.entrySet()) {
        writeCv(programmer, e.getKey(), e.getValue(), WRITE_TIMEOUT_MS);
      }
      JsonUtil.ok(resp, "{\"ok\":true}");
    } catch (Exception ex) {
      JsonUtil.err(resp, 500, "write failed: " + ex.getMessage());
    }
  }

  /**
   * POST /api/jmri/writeAddress (alias: /api/jmri/address)
   * Body:
   * mode=service|ops
   * newAddress=1..9999 REQUIRED — desired DCC address
   * address / long (ops only) current address and long flag (to reach loco)
   */
  private void handleWriteAddress(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    ModeSpec mode = parseMode(req);

    // Accept "newAddress" (preferred) or "addressNew" as alias.
    String newAddrStr = opt(req, "newAddress");
    if (newAddrStr.isEmpty())
      newAddrStr = opt(req, "addressNew");

    int newAddress;
    try {
      newAddress = Integer.parseInt(newAddrStr.trim());
    } catch (Exception e) {
      JsonUtil.err(resp, 400, "missing or invalid 'newAddress'");
      return;
    }
    if (newAddress <= 0 || newAddress > 9999) {
      JsonUtil.err(resp, 400, "'newAddress' out of range (1..9999)");
      return;
    }

    Programmer programmer = getProgrammer(mode, resp);
    if (programmer == null)
      return;

    // 1) Read CV29 to preserve other flags; fall back to 0 if read fails.
    int base29 = 0;
    try {
      base29 = readCv(programmer, 29, READ_TIMEOUT_MS);
    } catch (Exception ignore) {
      base29 = 0;
    }

    final int LONG_BIT = 0x20; // CV29 bit 5 = long-address mode

    Map<Integer, Integer> toWrite = new LinkedHashMap<>();
    if (newAddress >= 128) {
      // Compute CV17/18 for long address
      int cv17 = 192 + (newAddress / 256);
      int cv18 = newAddress % 256;
      int cv29 = base29 | LONG_BIT;

      toWrite.put(17, cv17);
      toWrite.put(18, cv18);
      toWrite.put(29, cv29);

      try {
        // Recommended order for switching to long: 17, 18, then 29
        writeCv(programmer, 17, cv17, WRITE_TIMEOUT_MS);
        writeCv(programmer, 18, cv18, WRITE_TIMEOUT_MS);
        writeCv(programmer, 29, cv29, WRITE_TIMEOUT_MS);
      } catch (Exception ex) {
        JsonUtil.err(resp, 500, "writeAddress failed (long): " + ex.getMessage());
        return;
      }
    } else {
      // Short address 1..127 → CV1; clear long bit in CV29
      int cv1 = newAddress;
      int cv29 = (base29 & ~LONG_BIT);

      toWrite.put(1, cv1);
      toWrite.put(29, cv29);

      try {
        // Recommended order for switching to short: 1, then 29
        writeCv(programmer, 1, cv1, WRITE_TIMEOUT_MS);
        writeCv(programmer, 29, cv29, WRITE_TIMEOUT_MS);
      } catch (Exception ex) {
        JsonUtil.err(resp, 500, "writeAddress failed (short): " + ex.getMessage());
        return;
      }
    }

    // Build "wrote" map for response
    Map<String, Integer> wroteStrKeys = new LinkedHashMap<>();
    for (Map.Entry<Integer, Integer> e : toWrite.entrySet()) {
      wroteStrKeys.put(Integer.toString(e.getKey()), e.getValue());
    }
    JsonUtil.ok(resp, "{\"ok\":true,\"wrote\":" + toJsonMap(wroteStrKeys) + "}");
  }

  // --------------------------- JMRI helpers ---------------------------

  /** Programming mode spec parsed from request. */
  private static class ModeSpec {
    final boolean ops;
    final int address; // only for ops
    final boolean longAddr;

    ModeSpec(boolean ops, int address, boolean longAddr) {
      this.ops = ops;
      this.address = address;
      this.longAddr = longAddr;
    }
  }

  private ModeSpec parseMode(HttpServletRequest req) {
    String mode = opt(req, "mode").toLowerCase(Locale.ROOT);
    boolean ops = "ops".equals(mode) || "onmain".equals(mode) || "operations".equals(mode);
    if (!ops)
      return new ModeSpec(false, 3, false); // service mode; address unused

    int address = 0;
    boolean longAddr = false;
    try {
      address = Integer.parseInt(opt(req, "address"));
      longAddr = "true".equalsIgnoreCase(opt(req, "long")) || "yes".equalsIgnoreCase(opt(req, "long"));
    } catch (Exception ignored) {
    }
    return new ModeSpec(true, address, longAddr);
  }

  /**
   * Resolve a Programmer based on the requested mode.
   * - service → global programmer
   * - ops → addressed programmer (requires address)
   */
  private Programmer getProgrammer(ModeSpec mode, HttpServletResponse resp) throws IOException {
    if (!mode.ops) {
      GlobalProgrammerManager gpm = InstanceManager.getNullableDefault(GlobalProgrammerManager.class);
      if (gpm == null) {
        JsonUtil.err(resp, 503, "no GlobalProgrammerManager available");
        return null;
      }
      Programmer p = gpm.getGlobalProgrammer();
      if (p == null) {
        JsonUtil.err(resp, 503, "no service mode programmer available");
        return null;
      }
      return p;
    }

    if (mode.address <= 0) {
      JsonUtil.err(resp, 400, "missing or invalid 'address' for ops");
      return null;
    }
    AddressedProgrammerManager apm = InstanceManager.getNullableDefault(AddressedProgrammerManager.class);
    if (apm == null) {
      JsonUtil.err(resp, 503, "no AddressedProgrammerManager available");
      return null;
    }
    AddressedProgrammer ap = apm.getAddressedProgrammer(mode.longAddr, mode.address);
    if (ap == null) {
      JsonUtil.err(resp, 503, "no ops-mode programmer for address");
      return null;
    }
    return ap;
  }

  private static int readCv(Programmer programmer, int cv, long timeoutMs) throws Exception {
    final CountDownLatch latch = new CountDownLatch(1);
    final int[] valueOut = new int[] { -1 };
    final int[] statusOut = new int[] { -1 };

    ProgListener listener = (value, status) -> {
      valueOut[0] = value;
      statusOut[0] = status;
      latch.countDown();
    };

    programmer.readCV(Integer.toString(cv), listener);
    boolean ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS);

    if (!ok)
      throw new IOException("CV" + cv + " read timeout");
    if (statusOut[0] != 0)
      throw new IOException("CV" + cv + " read failed (status=" + statusOut[0] + ")");
    if (valueOut[0] < 0 || valueOut[0] > 255)
      throw new IOException("CV" + cv + " read invalid value=" + valueOut[0]);
    return valueOut[0];
  }

  private static void writeCv(Programmer programmer, int cv, int value, long timeoutMs) throws Exception {
    final CountDownLatch latch = new CountDownLatch(1);
    final int[] statusOut = new int[] { -1 };

    ProgListener listener = (v, status) -> {
      statusOut[0] = status;
      latch.countDown();
    };

    programmer.writeCV(Integer.toString(cv), value, listener);
    boolean ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS);

    if (!ok)
      throw new IOException("CV" + cv + " write timeout");
    if (statusOut[0] != 0)
      throw new IOException("CV" + cv + " write failed (status=" + statusOut[0] + ")");
  }

  // --------------------------- Utils ---------------------------

  private static String opt(HttpServletRequest req, String k) {
    String v = req.getParameter(k);
    return v == null ? "" : v.trim();
  }

  private static List<Integer> parseCvList(String s) {
    List<Integer> out = new ArrayList<>();
    if (s == null || s.trim().isEmpty())
      return out;
    for (String part : s.split(",")) {
      String t = part.trim();
      if (t.isEmpty())
        continue;
      try {
        int cv = Integer.parseInt(t);
        if (cv >= 0 && cv <= 1024)
          out.add(cv);
      } catch (NumberFormatException ignored) {
      }
    }
    return out;
  }

  private static String toJsonMap(Map<String, Integer> map) {
    StringBuilder sb = new StringBuilder("{");
    boolean first = true;
    for (Map.Entry<String, Integer> e : map.entrySet()) {
      if (!first)
        sb.append(',');
      first = false;
      sb.append(JsonUtil.quote(e.getKey()))
          .append(':')
          .append(e.getValue() == null ? "null" : e.getValue().intValue());
    }
    sb.append('}');
    return sb.toString();
  }
}
