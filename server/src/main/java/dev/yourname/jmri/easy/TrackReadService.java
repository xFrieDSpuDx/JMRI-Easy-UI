package dev.yourname.jmri.easy;

import jmri.GlobalProgrammerManager;
import jmri.InstanceManager;
import jmri.ProgListener;
import jmri.Programmer;

import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * TrackReadService
 * ----------------
 * Reads essential DCC CVs from the service-mode programmer (programming track).
 * Resolves the locomotive address (short/long) and exposes raw CVs for debugging.
 */
public final class TrackReadService {

  /** Simple DTO for JSON serialization. */
  public static final class LocoData {
    public String address = "";
    public Integer cv29 = null;
    public Integer cv8 = null;
    public Integer cv7 = null;
    public Integer cv17 = null;
    public Integer cv18 = null;

    // UI-friendly fields (left blank on read; UI will fill)
    public String id = "";
    public String file = "";
    public String road = "";
    public String number = "";
    public String owner = "";
    public String model = "";
    public String image = "";
  }

  private TrackReadService() {}

  /**
   * Read locomotive data from programming track.
   * @param timeoutMs timeout per CV read
   * @return populated LocoData
   */
  public static LocoData readFromProgrammingTrack(int timeoutMs) {
    Programmer programmer = getGlobalProgrammerOrThrow();
    LocoData data = new LocoData();

    int cv29 = readCvSync(programmer, 29, timeoutMs);
    data.cv29 = cv29;

    // Optional informational CVs
    data.cv8 = tryReadCv(programmer, 8, timeoutMs);
    data.cv7 = tryReadCv(programmer, 7, timeoutMs);

    boolean longAddr = (cv29 & (1 << 5)) != 0; // bit 5 enables long addressing
    if (longAddr) {
      int cv17 = readCvSync(programmer, 17, timeoutMs);
      int cv18 = readCvSync(programmer, 18, timeoutMs);
      data.cv17 = cv17;
      data.cv18 = cv18;
      int longAddress = ((cv17 & 0x3F) << 8) | (cv18 & 0xFF);
      data.address = String.valueOf(longAddress);
    } else {
      int shortAddress = readCvSync(programmer, 1, timeoutMs);
      data.address = String.valueOf(shortAddress);
    }

    return data;
  }

  /** Attempt to read a CV; return null on failure. */
  private static Integer tryReadCv(Programmer p, int cv, int timeoutMs) {
    try {
      return readCvSync(p, cv, timeoutMs);
    } catch (RuntimeException ex) {
      return null;
    }
  }

  /** Blocking CV read with timeout; throws on error. */
  private static int readCvSync(Programmer programmer, int cvNumber, int timeoutMs) {
    Objects.requireNonNull(programmer, "programmer");
    final CountDownLatch latch = new CountDownLatch(1);
    final int[] out = new int[] { -1 };
    final String cv = String.valueOf(cvNumber);

    try {
      programmer.readCV(cv, new ProgListener() {
        @Override public void programmingOpReply(int value, int status) {
          if (status == ProgListener.OK) {
            out[0] = value & 0xFF;
          } else {
            out[0] = -2; // error marker
          }
          latch.countDown();
        }
      });
    } catch (Exception ex) {
      throw new RuntimeException("CV" + cv + " read dispatch failed: " + ex.getMessage(), ex);
    }

    try {
      boolean done = latch.await(timeoutMs, TimeUnit.MILLISECONDS);
      if (!done) throw new RuntimeException("CV" + cv + " read timed out after " + timeoutMs + "ms");
    } catch (InterruptedException ie) {
      Thread.currentThread().interrupt();
      throw new RuntimeException("CV" + cv + " read interrupted", ie);
    }

    if (out[0] == -2) throw new RuntimeException("CV" + cv + " read returned error status");
    if (out[0] < 0) throw new RuntimeException("CV" + cv + " read failed (no result)");
    return out[0];
  }

  /** Resolve the global service-mode programmer or throw a clear error. */
  private static Programmer getGlobalProgrammerOrThrow() {
    GlobalProgrammerManager gpm = InstanceManager.getNullableDefault(GlobalProgrammerManager.class);
    if (gpm == null) {
      throw new IllegalStateException("No GlobalProgrammerManager available (is a command station connected in Service Mode?)");
    }
    Programmer p = gpm.getGlobalProgrammer();
    if (p == null) {
      throw new IllegalStateException("No Global Programmer present (cannot access programming track).");
    }
    return p;
  }
}
