package dev.yourname.jmri.easy;

import jmri.server.web.spi.WebServerConfiguration;
import org.openide.util.lookup.ServiceProvider;
import javax.servlet.http.HttpServlet;
import java.util.*;

/**
 * Adds static path mappings for the Easy UI.
 * - /web/easy-ui -> User Files "web/easy-ui"
 * - /easy-ui     -> same, as a convenience
 */
@ServiceProvider(service = WebServerConfiguration.class)
public class EasyWebConfig implements WebServerConfiguration {

  @Override
  public Map<String, String> getFilePaths() {
    Map<String, String> map = new HashMap<>();
    map.put("/web/jrmi-easy-ui", "preference:web/JMRI-Easy-UI"); // serve from User Files
    map.put("/jmri-easy-ui",     "preference:web/JMRI-Easy-UI"); // alternate, shorter URL
    return map;
  }

  @Override
  public Map<String, String> getRedirectedPaths() {
    return Collections.emptyMap();
  }

  @Override
  public List<String> getForbiddenPaths() {
    return Collections.emptyList();
  }
}
