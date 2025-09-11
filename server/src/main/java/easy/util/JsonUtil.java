package dev.yourname.jmri.easy.util;

import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

public final class JsonUtil {
  private JsonUtil() {}

  public static void ok(HttpServletResponse resp, String json) throws IOException {
    resp.setStatus(200);
    resp.setContentType("application/json;charset=utf-8");
    resp.getWriter().write(json);
  }

  public static void err(HttpServletResponse resp, int code, String message) throws IOException {
    resp.setStatus(code);
    resp.setContentType("application/json;charset=utf-8");
    resp.getWriter().write("{\"ok\":false,\"error\":" + quote(message) + "}");
  }

  /** Minimal JSON string escaper for quotes and backslashes. */
  public static String quote(String s) {
    if (s == null) s = "";
    s = s.replace("\\", "\\\\").replace("\"", "\\\"");
    return "\"" + s + "\"";
  }
}
