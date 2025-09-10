package dev.yourname.jmri.easy;

import dev.yourname.jmri.easy.util.JsonUtil;

import jmri.InstanceManager;
import jmri.ConfigureManager;
import jmri.configurexml.LoadXmlUserAction;
import jmri.configurexml.StoreXmlUserAction;
import jmri.util.FileUtil;

import javax.servlet.annotation.WebServlet;
import org.openide.util.lookup.ServiceProvider;
import javax.servlet.http.*;
import javax.swing.JFileChooser;
import java.io.File;
import java.io.IOException;

/**
 * GET /api/store/user/file -> returns the user panels file JMRI is using (if
 * known)
 * POST /api/store -> store to <UserFiles>/AutoStorePanels.xml
 * POST /api/store/user -> same as /api/store
 * POST /api/store/user?file=Foo -> store to <UserFiles>/Foo(.xml)
 */
@WebServlet(name = "EasyStoreApi", urlPatterns = { "/api/store", "/api/store/*" })
@ServiceProvider(service = HttpServlet.class)
public class StoreApiServlet extends HttpServlet {

  /* ------------------------------- GET --------------------------------- */
  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String p = path(req);
    if ("/user/file".equals(p)) {
      getCurrentUserPanelsFile(req, resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  private void getCurrentUserPanelsFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    File f = null;

    // 1) If the user loaded a panels file via "Load Panels...", JMRI tracks it
    // here:
    try {
      f = LoadXmlUserAction.getCurrentFile();
    } catch (Throwable ignore) {
    }

    // 2) Otherwise, JMRI keeps the last-used "Store Panels..." chooser selection:
    if (f == null) {
      try {
        JFileChooser ch = StoreXmlUserAction.getUserFileChooser();
        if (ch != null)
          f = ch.getSelectedFile();
      } catch (Throwable ignore) {
      }
    }

    // 3) Fallback: suggest a file in the active profile's User Files dir
    String userDir = FileUtil.getUserFilesPath();
    if (f == null) {
      f = new File(userDir, "AutoStorePanels.xml");
    }

    String abs = f.getAbsolutePath();
    String portable = FileUtil.getPortableFilename(f); // e.g. "profile:AutoStorePanels.xml"
    boolean exists = f.exists();

    String body = ""
        + "{"
        + "\"fileName\":" + JsonUtil.quote(f.getName()) + ","
        + "\"absolute\":" + JsonUtil.quote(abs) + ","
        + "\"portable\":" + JsonUtil.quote(portable) + ","
        + "\"exists\":" + exists + ","
        + "\"userDir\":" + JsonUtil.quote(userDir)
        + "}";
    JsonUtil.ok(resp, body);
  }

  /* ------------------------------- POST -------------------------------- */
  @Override
  protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String p = path(req);
    if (p.isEmpty() || "/user".equals(p)) {
      storeUser(req, resp);
      return;
    }
    JsonUtil.err(resp, 404, "not found");
  }

  /** Store tables + panels to the requested (or default) file in User Files. */
  private void storeUser(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    String fileParam = trim(req.getParameter("file"));
    String fileName = (fileParam == null || fileParam.isBlank()) ? "AutoStorePanels.xml" : fileParam;
    if (!fileName.toLowerCase().endsWith(".xml"))
      fileName += ".xml";

    String userDir = FileUtil.getUserFilesPath();
    File target = new File(userDir, fileName);

    ConfigureManager cm = InstanceManager.getDefault(ConfigureManager.class);
    boolean ok = (cm != null) && cm.storeUser(target); // writes tables + panels together

    if (ok) {
      String body = "{\"ok\":true,\"file\":" + JsonUtil.quote(target.getAbsolutePath()) + "}";
      JsonUtil.ok(resp, body);
    } else {
      JsonUtil.err(resp, 500, "Store failed");
    }
  }

  /* ------------------------------ Helpers ------------------------------ */
  private static String path(HttpServletRequest req) {
    String p = req.getPathInfo();
    return (p == null) ? "" : p;
  }

  private static String trim(String s) {
    return (s == null) ? "" : s.trim();
  }
}
