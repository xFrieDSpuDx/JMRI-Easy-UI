package easy;

import jmri.server.web.spi.WebServerConfiguration;
import jmri.util.FileUtil;

import java.util.*;

/**
 * Serve static files from the JMRI install folder: <JMRI>/jmri-easy-ui/web
 * URL: http://<host>:12080/easy/
 */
public final class EasyWebConfig implements WebServerConfiguration {

  public EasyWebConfig() {
    // Log the resolved absolute path so you can confirm where it points
    try {
      String resolved = FileUtil.getExternalFilename("program:jmri-easy-ui/web");
      System.out.println("[easy] Mounting /easy from: " + resolved);
    } catch (Exception e) {
      System.err.println("[easy] Could not resolve program:jmri-easy-ui/web: " + e.getMessage());
    }
  }

  /** Map URL prefix → JMRI-allowed location (program:...) */
  @Override
  public Map<String, String> getFilePaths() {
    Map<String, String> map = new LinkedHashMap<>();
    map.put("/easy", "program:jmri-easy-ui/web");   // <JMRI>/jmri-easy-ui/web
    return map;
  }

  @Override
  public Map<String, String> getRedirectedPaths() {
    return Collections.emptyMap();
  }

  @Override
  public List<String> getForbiddenPaths() {
    return Arrays.asList("/WEB-INF", "/META-INF");
  }
}
