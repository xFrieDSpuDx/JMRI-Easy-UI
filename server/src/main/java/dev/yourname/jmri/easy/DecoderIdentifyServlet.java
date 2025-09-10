package dev.yourname.jmri.easy;

import jmri.InstanceManager;
import jmri.ProgListener;
import jmri.Programmer;
import jmri.ProgrammerException;
import jmri.ProgrammingMode;
import jmri.GlobalProgrammerManager;
import jmri.jmrit.decoderdefn.DecoderFile;
import jmri.jmrit.decoderdefn.DecoderIndexFile;
import jmri.jmrit.decoderdefn.IdentifyDecoder;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.*;
import java.util.concurrent.*;
import java.util.stream.Collectors;

/**
 * GET /api/decoder/identify
 *
 * - Reserves the programming track programmer
 * - Runs JMRI's IdentifyDecoder state machine to get mfgID/modelID/productID
 * - Deep reads a curated set of relevant CVs (safe reads only; no writes)
 * - Looks up candidate decoders via DecoderIndexFile
 * - Responds with JSON
 *
 * Notes:
 * - Requires JMRI runtime (run inside JMRI or with its classpath)
 * - Designed for the built-in JMRI Jetty web server
 */
@WebServlet(name = "DecoderIdentifyServlet", urlPatterns = { "/api/decoder/identify" })
public class DecoderIdentifyServlet extends HttpServlet {

    private static final Logger log = LoggerFactory.getLogger(DecoderIdentifyServlet.class);

    // Reasonable defaults; tweak if your command station is slow/noisy.
    private static final int IDENTIFY_TIMEOUT_SEC = 45;
    private static final int READ_TIMEOUT_MS = 4000;

    // “Deep read” list: common, informative CVs that are safe to read.
    // (Identification CVs are read by IdentifyDecoder separately.)
    private static final List<String> DEEP_CVS = List.of(
            "1", // Short address
            "7", // Version (also read during identify)
            "8", // Manufacturer (also read during identify)
            "17", "18", // Long address
            "19", // Consist address
            "21", "22", // Function group enable
            "29", // Basic configuration
            "3", "4", "5", "6", // Accel / Decel / Vmax / Vmid
            "105", "106" // User IDs seen on many decoders
    );

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {

        resp.setContentType("application/json; charset=utf-8");

        final GlobalProgrammerManager gpm = InstanceManager.getDefault(GlobalProgrammerManager.class);
        if (gpm == null || !gpm.isGlobalProgrammerAvailable()) {
            sendError(resp, 503, "No programming-track (Global) programmer is available.");
            return;
        }

        Programmer programmer = null;
        try (PrintWriter out = resp.getWriter()) {
            programmer = gpm.reserveGlobalProgrammer();
            if (programmer == null) {
                sendError(resp, 409, "Programming track is busy. Try again in a moment.");
                return;
            }

            // Choose a sane programming mode if one isn’t already set.
            List<ProgrammingMode> modes = programmer.getSupportedModes();
            if (modes != null && !modes.isEmpty() && programmer.getMode() == null) {
                programmer.setMode(modes.get(0)); // first is typically “best” per JMRI docs
            }

            // 1) Identify decoder (reads CV7/8 and any product-ID CVs needed per mfg).
            IdentifyResult idResult = identifyDecoder(programmer);

            // 2) Deep CV reads (non-destructive).
            Map<String, CvRead> deepReads = new LinkedHashMap<>();
            for (String cv : DEEP_CVS) {
                deepReads.put(cv, readCvBlocking(programmer, cv, READ_TIMEOUT_MS));
            }

            // 3) Use DecoderIndexFile to find likely candidates.
            DecoderIndexFile index = InstanceManager.getDefault(DecoderIndexFile.class);
            String mfgName = (index != null) ? index.mfgNameFromID(Integer.toString(idResult.mfgID)) : null;

            List<DecoderFile> candidates = findCandidates(index, idResult);

            // 4) Emit JSON
            String json = buildJsonResponse(idResult, mfgName, deepReads, candidates);
            resp.setStatus(HttpServletResponse.SC_OK);
            out.println(json);

        } catch (TimeoutException te) {
            log.warn("Identification timed out", te);
            sendError(resp, 504, "Decoder identification timed out.");
        } catch (Exception e) {
            log.error("Identify servlet error", e);
            sendError(resp, 500, "Internal error: " + e.getMessage());
        } finally {
            if (programmer != null) {
                try {
                    gpm.releaseGlobalProgrammer(programmer);
                } catch (Exception ignore) {
                }
            }
        }
    }

    // --- Identification using JMRI’s IdentifyDecoder ------------------------

    private IdentifyResult identifyDecoder(Programmer programmer) throws InterruptedException, TimeoutException {
        CountDownLatch latch = new CountDownLatch(1);
        IdentifyResult result = new IdentifyResult();

        IdentifyDecoder identify = new IdentifyDecoder(programmer) {
            @Override
            protected void done(int mfgID, int modelID, int productID) {
                result.mfgID = mfgID;
                result.modelID = modelID;
                result.productID = productID;
                latch.countDown();
            }

            @Override
            protected void message(String m) {
                log.info("IdentifyDecoder: {}", m);
            }

            @Override
            protected void error() {
                log.warn("IdentifyDecoder: error during identification");
                latch.countDown();
            }
        };

        // Start the state machine (reads CV8, CV7, and any product-ID CVs as needed).
        identify.start(); // provided by AbstractIdentify base class

        if (!latch.await(IDENTIFY_TIMEOUT_SEC, TimeUnit.SECONDS)) {
            throw new TimeoutException("IdentifyDecoder did not complete in time.");
        }
        return result;
    }

    // --- Blocking CV read helper -------------------------------------------

    private CvRead readCvBlocking(Programmer p, String cv, int timeoutMs) {
        CountDownLatch latch = new CountDownLatch(1);
        final int[] valueBox = new int[1];
        final int[] statusBox = new int[1];

        try {
            p.readCV(cv, (val, status) -> {
                valueBox[0] = val;
                statusBox[0] = status;
                latch.countDown();
            });
        } catch (ProgrammerException ex) {
            return CvRead.error("StartFailed: " + ex.getMessage());
        }

        try {
            boolean ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS);
            if (!ok)
                return CvRead.error("Timeout");
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            return CvRead.error("Interrupted");
        }

        if (statusBox[0] == ProgListener.OK) {
            return CvRead.ok(valueBox[0]);
        } else {
            return CvRead.error("ProgStatus:" + statusBox[0]);
        }
    }

    // --- Decoder candidates lookup -----------------------------------------

    private List<DecoderFile> findCandidates(DecoderIndexFile index, IdentifyResult r) {
        if (index == null)
            return List.of();

        // Try the newer signature with productID fields first:
        List<DecoderFile> list = index.matchingDecoderList(
                null, null, // mfg, family
                asStr(r.mfgID), // decoderMfgID (CV8)
                asStr(r.modelID), // decoderVersionID (CV7)
                null, // decoderProductID (if you have one, pass it here)
                null, // model
                null, // developerID
                null, // manufacturerID
                (r.productID >= 0 ? asStr(r.productID) : null) // productID (RailCom etc.)
        );

        if (list == null || list.isEmpty()) {
            // Fallback to the classic 6-arg matcher (mfgID + versionID only)
            list = index.matchingDecoderList(
                    null, null,
                    asStr(r.mfgID), asStr(r.modelID), null, null);
        }
        return list != null ? list : List.of();
    }

    private static String asStr(int v) {
        return Integer.toString(v);
    }

    // --- JSON building (minimal, dependency-free) ---------------------------

    private String buildJsonResponse(IdentifyResult id,
            String mfgName,
            Map<String, CvRead> deepReads,
            List<DecoderFile> candidates) {
        StringBuilder sb = new StringBuilder(4096);
        sb.append("{");

        sb.append("\"status\":\"ok\",");
        sb.append("\"identify\":{");
        sb.append("\"mfgId\":").append(id.mfgID).append(",");
        if (mfgName != null)
            sb.append("\"mfgName\":").append(q(mfgName)).append(",");
        sb.append("\"modelId\":").append(id.modelID).append(",");
        sb.append("\"productId\":").append(id.productID);
        sb.append("},");

        // Deep CVs
        sb.append("\"cvReads\":{");
        boolean first = true;
        for (var e : deepReads.entrySet()) {
            if (!first)
                sb.append(",");
            first = false;
            String cv = e.getKey();
            CvRead r = e.getValue();
            sb.append(q(cv)).append(":{");
            if (r.ok) {
                sb.append("\"status\":\"OK\",\"value\":").append(r.value);
            } else {
                sb.append("\"status\":\"ERROR\",\"error\":").append(q(r.error));
            }
            sb.append("}");
        }
        sb.append("},");

        // Candidates
        sb.append("\"candidates\":[");
        for (int i = 0; i < candidates.size(); i++) {
            DecoderFile df = candidates.get(i);
            if (i > 0)
                sb.append(",");
            sb.append("{")
                    .append("\"title\":").append(q(df.titleString())).append(",")
                    .append("\"manufacturer\":").append(q(df.getMfg())).append(",")
                    .append("\"mfgId\":").append(q(df.getMfgID())).append(",")
                    .append("\"model\":").append(q(df.getModel())).append(",")
                    .append("\"family\":").append(q(df.getFamily())).append(",")
                    .append("\"productId\":").append(q(df.getProductID())).append(",")
                    .append("\"fileName\":").append(q(df.getFileName()))
                    .append("}");
        }
        sb.append("]");

        sb.append("}");
        return sb.toString();
    }

    private static String q(String s) {
        if (s == null)
            return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private void sendError(HttpServletResponse resp, int code, String msg) throws IOException {
        resp.setStatus(code);
        try (PrintWriter out = resp.getWriter()) {
            out.println("{\"status\":\"error\",\"code\":" + code + ",\"message\":" + q(msg) + "}");
        }
    }

    // --- small DTOs ---------------------------------------------------------

    private static class IdentifyResult {
        int mfgID = -1;
        int modelID = -1;
        int productID = -1;
    }

    private static class CvRead {
        final boolean ok;
        final Integer value; // null when !ok
        final String error; // null when ok

        private CvRead(boolean ok, Integer value, String error) {
            this.ok = ok;
            this.value = value;
            this.error = error;
        }

        static CvRead ok(int v) {
            return new CvRead(true, v, null);
        }

        static CvRead error(String e) {
            return new CvRead(false, null, e);
        }
    }
}
