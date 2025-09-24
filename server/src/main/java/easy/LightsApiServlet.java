package easy;

import easy.util.JsonUtil;
import jmri.InstanceManager;
import jmri.Light;
import jmri.LightManager;
import jmri.VariableLight;

import javax.servlet.annotation.WebServlet;
import org.openide.util.lookup.ServiceProvider;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.util.Collections;
import java.util.Set;

import jmri.LightManager;
import jmri.Light;

/**
 * GET /api/lights → list lights with intensity (current/target when applicable)
 *
 * Output matches your sample, plus:
 * "currentIntensity": number|null, // 0.0–1.0 for VariableLight
 * "targetIntensity": number|null
 */
@WebServlet(name = "EasyLightsApi", urlPatterns = { "/api/lights", "/api/lights/*" })
@ServiceProvider(service = HttpServlet.class)
public class LightsApiServlet extends HttpServlet {

  @Override
  protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
    LightManager lm = InstanceManager.getDefault(LightManager.class);
    Set<Light> lights = (lm != null && lm.getNamedBeanSet() != null) ? lm.getNamedBeanSet() : Collections.emptySet();

    StringBuilder out = new StringBuilder(256 + lights.size() * 180);
    out.append("[");

    boolean first = true;
    for (Light l : lights) {
      if (!first)
        out.append(',');
      first = false;

      final String name = s(l.getSystemName());
      final String userName = s(l.getUserName());
      final String comment = s(l.getComment());
      final int state = l.getState();

      // intensities for VariableLight (else nulls)
      String currentIntensityJson = "null";
      String targetIntensityJson = "null";
      if (l instanceof VariableLight) {
        try {
          VariableLight vl = (VariableLight) l;
          currentIntensityJson = Double.toString(vl.getCurrentIntensity()); // 0.0–1.0
          targetIntensityJson = Double.toString(vl.getTargetIntensity()); // 0.0–1.0
        } catch (Throwable ignore) {
          // leave as nulls if anything unexpected happens
        }
      }

      out.append("{\"type\":\"light\",\"data\":{")
          .append("\"name\":").append(JsonUtil.quote(name))
          .append(",\"userName\":").append(JsonUtil.quote(userName))
          .append(",\"comment\":").append(comment.isEmpty() ? "null" : JsonUtil.quote(comment))
          .append(",\"properties\":[]") // keep your existing empty array
          .append(",\"state\":").append(state) // same numeric values you’re already returning
          .append(",\"currentIntensity\":").append(currentIntensityJson)
          .append(",\"targetIntensity\":").append(targetIntensityJson)
          .append("}}");
    }

    out.append("]");
    JsonUtil.ok(response, out.toString());
  }

  @Override
  protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String name = tail(req);
    if (name.isEmpty()) {
      JsonUtil.err(resp, 400, "missing light name");
      return;
    }

    LightManager lm = InstanceManager.getDefault(LightManager.class);
    if (lm == null) {
      JsonUtil.err(resp, 500, "LightManager unavailable");
      return;
    }

    // Try system name first, then user name
    Light l = lm.getBySystemName(name);
    if (l == null)
      l = lm.getByUserName(name);

    if (l == null) {
      JsonUtil.err(resp, 404, "light not found: " + name);
      return;
    }

    boolean ok = false;
    try {
      // Preferred on newer JMRI
      lm.deleteBean(l, "DoDelete");
      ok = true;
    } catch (Throwable t1) {
      try {
        // Fallback on older versions
        lm.deregister(l);
        ok = true;
      } catch (Throwable t2) {
        // leave ok=false
      }
    }

    if (ok) {
      JsonUtil.ok(resp, "{\"ok\":true,\"deleted\":" + JsonUtil.quote(l.getSystemName()) + "}");
    } else {
      JsonUtil.err(resp, 500, "failed to delete light: " + name);
    }
  }

  // ---- NEW: POST fallback → treat as DELETE when asked ----
  @Override
  protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String override = req.getHeader("X-HTTP-Method-Override");
    if (override == null)
      override = req.getParameter("_method");
    if ("DELETE".equalsIgnoreCase(override)) {
      doDelete(req, resp);
      return;
    }
    // If you want to add POST actions later, handle them here.
    JsonUtil.err(resp, 405, "use HTTP DELETE or POST with _method=DELETE");
  }

  private static String tail(HttpServletRequest req) {
    String pi = req.getPathInfo(); // e.g. "/DL307"
    if (pi == null || "/".equals(pi))
      return "";
    return java.net.URLDecoder.decode(pi.substring(1), java.nio.charset.StandardCharsets.UTF_8);
  }

  /** Default empty-safe string. */
  private static String s(String v) {
    return (v == null) ? "" : v;
  }
}
