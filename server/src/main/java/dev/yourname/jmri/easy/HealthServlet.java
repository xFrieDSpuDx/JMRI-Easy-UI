package dev.yourname.jmri.easy;

import javax.servlet.annotation.WebServlet;
import org.openide.util.lookup.ServiceProvider;
import javax.servlet.http.*;
import java.io.IOException;

/** Simple readiness endpoint. */
@WebServlet(name = "EasyHealth", urlPatterns = {"/api/health"})
@ServiceProvider(service = HttpServlet.class)
public class HealthServlet extends HttpServlet {
  @Override protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    resp.setContentType("application/json;charset=utf-8");
    resp.getWriter().write("{\"ok\":true}");
  }
}
