// src/main/java/dev/yourname/jmri/easy/SystemPrefixApiServlet.java
package dev.yourname.jmri.easy;

import dev.yourname.jmri.easy.util.JsonUtil;

import javax.servlet.annotation.WebServlet;
import javax.servlet.http.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import jmri.InstanceManager;
import jmri.SystemConnectionMemo;
import org.openide.util.lookup.ServiceProvider;

/**
 * Expose JMRI connection prefixes so the UI can suggest correct system names.
 *
 * GET /api/jmri/prefix?type=turnout|sensor|light
 *
 * Response JSON:
 * [
 *   {
 *     "type": "turnout",
 *     "systemPrefix": "L",
 *     "systemNamePrefix": "LT",
 *     "connectionName": "LocoNet"
 *   },
 *   ...
 * ]
 *
 * Notes:
 * - Uses SystemConnectionMemo.getSystemPrefix() and getUserName().
 * - Derives systemNamePrefix as systemPrefix + bean type letter (T/S/L),
 *   which matches JMRI’s standard scheme (e.g. "L" + "T" → "LT").
 */
@WebServlet(name = "EasyJmriPrefixes", urlPatterns = { "/api/jmri/prefix" })
@ServiceProvider(service = HttpServlet.class)
public class SystemPrefixApiServlet extends HttpServlet {

  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    final String typeParam = opt(req, "type").toLowerCase(Locale.ROOT);
    final String beanType = typeParam.isEmpty() ? "turnout" : typeParam;
    final String typeLetter = beanTypeLetter(beanType);

    List<String> rows = new ArrayList<>();

    // Enumerate all active system connections
    for (SystemConnectionMemo memo : InstanceManager.getList(SystemConnectionMemo.class)) {
      final String sysPrefix = safe(memo.getSystemPrefix());
      if (sysPrefix.isEmpty()) continue;

      final String sysNamePrefix = sysPrefix + typeLetter;
      final String connectionName = safe(memo.getUserName());

      String row = "{"
          + "\"type\":" + JsonUtil.quote(beanType)
          + ",\"systemPrefix\":" + JsonUtil.quote(sysPrefix)
          + ",\"systemNamePrefix\":" + JsonUtil.quote(sysNamePrefix)
          + ",\"connectionName\":" + JsonUtil.quote(connectionName)
          + "}";
      rows.add(row);
    }

    // If there are no memos (unlikely but possible), return empty array
    JsonUtil.ok(resp, "[" + String.join(",", rows) + "]");
  }

  // Map bean type → standard single-letter suffix used in system names
  private static String beanTypeLetter(String beanType) {
    switch (beanType) {
      case "turnout": return "T";
      case "sensor":  return "S";
      case "light":   return "L";
      default:        return ""; // unknown types: no suffix
    }
  }

  private static String opt(HttpServletRequest req, String k) {
    String v = req.getParameter(k);
    return v == null ? "" : v.trim();
  }
  private static String safe(String s) { return (s == null) ? "" : s; }
}
