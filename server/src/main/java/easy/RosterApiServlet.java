package dev.yourname.jmri.easy;

import dev.yourname.jmri.easy.util.JsonUtil;
import dev.yourname.jmri.easy.util.RosterUtil;
import jmri.jmrit.roster.*;

import javax.servlet.annotation.WebServlet;
import org.openide.util.lookup.ServiceProvider;
import javax.servlet.http.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.Normalizer;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Roster REST API (single servlet)
 *
 * Endpoints:
 * GET /api/roster → list roster entries (JSON)
 * GET /api/roster/icon → stream locomotive image (or SVG placeholder)
 * GET /api/roster/fn/list → read <functionlabels> as JSON
 * GET /api/roster/decoder → read decoder + identify fields from roster XML
 *
 * POST /api/roster/add → quick add (form) OR upload XML (multipart "file")
 * POST /api/roster/delete → delete by id or file
 * POST /api/roster/image → attach/replace image (multipart "image")
 * POST /api/roster/update → update basic roster fields (id, address, road,
 * number, owner, model)
 * POST /api/roster/fn/save → replace <functionlabels> (form arrays)
 * POST /api/roster/decoder/save
 * → save decoder/identify fields back to roster XML
 *
 * Behavior:
 * - Every XML write refreshes <dateUpdated> with millisecond precision.
 * - On "add" (form + multipart), baseline sections are guaranteed:
 * <functionlabels/>, <soundlabels/>, <values/>.
 * - Image upload normalizes JMRI-style attributes:
 * imageFilePath = base name (no extension), iconFilePath =
 * "preference:roster/<file.ext>".
 */
@WebServlet(name = "EasyRosterApi", urlPatterns = { "/api/roster", "/api/roster/*" })
@ServiceProvider(service = HttpServlet.class)
public class RosterApiServlet extends HttpServlet {

  // ============================ Router ============================

  @Override
  protected void doGet(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String path = normalize(getPath(request));

    if (path.isEmpty() || "/".equals(path)) {
      list(response);
      return;
    }
    if ("/icon".equals(path)) {
      streamIcon(request, response);
      return;
    }
    if ("/fn".equals(path) || "/fn/list".equals(path)) {
      functionsList(request, response);
      return;
    }
    if ("/decoder".equals(path)) {
      decoderInfo(request, response);
      return;
    }

    JsonUtil.err(response, 404, "not found");
  }

  @Override
  protected void doPost(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String path = normalize(getPath(request));

    if ("/add".equals(path)) {
      add(request, response);
      return;
    }
    if ("/delete".equals(path)) {
      delete(request, response);
      return;
    }
    if ("/image".equals(path)) {
      image(request, response);
      return;
    }
    if ("/update".equals(path)) {
      update(request, response);
      return;
    }
    if ("/fn/save".equals(path)) {
      functionsSave(request, response);
      return;
    }
    if ("/decoder/save".equals(path)) {
      decoderSave(request, response);
      return;
    }

    JsonUtil.err(response, 404, "not found");
  }

  private static String getPath(HttpServletRequest request) {
    String pathInfo = request.getPathInfo();
    return (pathInfo == null) ? "" : pathInfo;
  }

  private static String normalize(String path) {
    if (path == null)
      return "";
    while (path.endsWith("/") && path.length() > 1)
      path = path.substring(0, path.length() - 1);
    return path;
  }

  // ============================ GET /api/roster ============================

  /** Return a compact JSON array of roster entries (no CVs). */
  private void list(HttpServletResponse response) throws IOException {
    Roster roster = Roster.getDefault();
    List<RosterEntry> rosterEntries = roster.getAllEntries();

    StringBuilder json = new StringBuilder(256 + rosterEntries.size() * 128);
    json.append("[");
    for (int i = 0; i < rosterEntries.size(); i++) {
      RosterEntry entry = rosterEntries.get(i);
      if (i > 0)
        json.append(',');
      json.append("{\"id\":").append(JsonUtil.quote(n(entry.getId())))
          .append(",\"fileName\":").append(JsonUtil.quote(n(entry.getFileName())))
          .append(",\"address\":").append(JsonUtil.quote(n(entry.getDccAddress())))
          .append(",\"road\":").append(JsonUtil.quote(n(entry.getRoadName())))
          .append(",\"number\":").append(JsonUtil.quote(n(entry.getRoadNumber())))
          .append(",\"owner\":").append(JsonUtil.quote(n(entry.getOwner())))
          .append(",\"model\":").append(JsonUtil.quote(n(entry.getModel())))
          .append("}");
    }
    json.append("]");
    JsonUtil.ok(response, json.toString());
  }

  // ============================ GET /api/roster/icon
  // ============================

  /**
   * Streams the roster image referenced by XML (or a simple SVG placeholder if
   * missing).
   * Query params:
   * - id: roster entry title (preferred)
   * - file: roster XML filename
   */
  private void streamIcon(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String rosterId = opt(request, "id");
    String xmlFileName = opt(request, "file");

    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry entry = Roster.getDefault().entryFromTitle(rosterId);
      if (entry != null)
        xmlFileName = n(entry.getFileName());
    }

    File imageFile = null;
    boolean placeholderReferenced = false;

    if (!xmlFileName.isEmpty()) {
      File xmlFile = new File(RosterUtil.rosterFolder(), xmlFileName);
      String imageName = RosterUtil.readImageNameFromXml(xmlFile);
      if (imageName != null && !imageName.trim().isEmpty()) {
        placeholderReferenced = "_placeholder.png".equals(imageName);
        File candidate = new File(RosterUtil.rosterFolder(), imageName);
        if (candidate.exists() && candidate.isFile())
          imageFile = candidate;
      }
    }

    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");

    if (imageFile == null || placeholderReferenced) {
      response.setContentType("image/svg+xml;charset=utf-8");
      String label = !rosterId.isEmpty() ? rosterId : (!xmlFileName.isEmpty() ? xmlFileName : "No Image");
      String svg = ""
          + "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80'>"
          + "  <rect width='100%' height='100%' fill='#0f1622' stroke='#213046'/>"
          + "  <g fill='#a7b3c6' font-family='system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial' font-size='12'>"
          + "    <text x='50%' y='40%' text-anchor='middle'>No Image</text>"
          + "    <text x='50%' y='60%' text-anchor='middle'>" + esc(label) + "</text>"
          + "  </g>"
          + "</svg>";
      response.getWriter().write(svg);
      return;
    }

    response.setContentType(contentTypeFor(imageFile.getName()));
    try (OutputStream out = response.getOutputStream()) {
      Files.copy(imageFile.toPath(), out);
    }
  }

  // ============================ POST /api/roster/add
  // ============================

  /**
   * Create a new roster entry.
   * - Multipart mode: upload an XML file (part name = "file")
   * - Form mode : minimal XML created from fields; baseline sections are injected
   */
  private void add(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String contentTypeHeader = header(request.getContentType());

    // ========== A) Multipart upload ==========
    if (contentTypeHeader.toLowerCase(Locale.ROOT).startsWith("multipart/")) {
      String boundary = extractBoundary(contentTypeHeader);
      if (boundary == null) {
        JsonUtil.err(response, 400, "multipart boundary missing");
        return;
      }

      byte[] requestBytes = readAll(request.getInputStream(), 20 * 1024 * 1024);
      PartData xmlPart = findFilePart(requestBytes, boundary, "file");
      if (xmlPart == null || xmlPart.data == null || xmlPart.data.length == 0) {
        JsonUtil.err(response, 400, "missing file part");
        return;
      }

      String xmlFileName = suggestXmlName(xmlPart.filename, "New_Entry.xml");
      File xmlFile = RosterUtil.saveXml(xmlFileName, xmlPart.data);

      // Normalize image references and ensure placeholder
      String placeholderName = RosterUtil.ensurePlaceholder();
      RosterUtil.updateXmlIconRefs(xmlFile, placeholderName);

      // Ensure baseline sections and current <dateUpdated> (milliseconds)
      ensureBaselineOnFile(xmlFile);

      Roster.getDefault().reindex();
      Roster.getDefault().writeRoster();

      JsonUtil.ok(response, "{\"ok\":true,\"file\":" + JsonUtil.quote(xmlFileName) + "}");
      return;
    }

    // ========== B) Quick add (form fields) ==========
    String rosterId = opt(request, "id");
    String xmlFileName = sanitizeToFile(opt(request, "file"));
    String dccAddress = opt(request, "address");
    String roadName = opt(request, "road");
    String roadNumber = opt(request, "number");
    String ownerName = opt(request, "owner");
    String modelText = opt(request, "model");

    if (rosterId.isEmpty()) {
      JsonUtil.err(response, 400, "missing id");
      return;
    }

    String xmlContent = minimalXml(rosterId, xmlFileName, roadName, roadNumber, ownerName, modelText, dccAddress);
    File xmlFile = RosterUtil.saveXml(xmlFileName, xmlContent.getBytes(StandardCharsets.UTF_8));

    String placeholderName = RosterUtil.ensurePlaceholder();
    RosterUtil.updateXmlIconRefs(xmlFile, placeholderName);

    // Redundant safety: normalize baseline again (cheap and safe)
    ensureBaselineOnFile(xmlFile);

    Roster.getDefault().reindex();
    Roster.getDefault().writeRoster();

    JsonUtil.ok(response,
        "{\"ok\":true,\"id\":" + JsonUtil.quote(rosterId) + ",\"file\":" + JsonUtil.quote(xmlFileName) + "}");
  }

  // ============================ POST /api/roster/delete
  // ============================

  private void delete(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String rosterId = opt(request, "id");
    String xmlFileName = opt(request, "file");

    if (rosterId.isEmpty() && xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing id or file");
      return;
    }

    // Resolve file name from id if necessary
    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry entry = Roster.getDefault().entryFromTitle(rosterId);
      if (entry != null)
        xmlFileName = n(entry.getFileName());
    }

    // Best-effort cleanup of image referenced by the XML (not placeholder)
    if (!xmlFileName.isEmpty()) {
      File xmlFile = new File(RosterUtil.rosterFolder(), xmlFileName);
      String imageName = RosterUtil.readImageNameFromXml(xmlFile);
      if (imageName != null && !imageName.equals("_placeholder.png")) {
        File imageFile = new File(RosterUtil.rosterFolder(), imageName);
        if (imageFile.exists())
          imageFile.delete();
      }
    }

    boolean ok = RosterUtil.deleteEntry(rosterId, xmlFileName);
    JsonUtil.ok(response,
        "{\"ok\":" + ok + ",\"id\":" + JsonUtil.quote(rosterId) + ",\"file\":" + JsonUtil.quote(xmlFileName) + "}");
  }

  // ============================ POST /api/roster/image
  // ============================

  /**
   * Upload and attach an image to a roster entry.
   * - Saves a timestamped file under the roster folder
   * - Updates XML's icon/image references
   * - Refreshes <dateUpdated> with millisecond precision
   */
  private void image(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String rosterId = opt(request, "id");
    String xmlFileName = opt(request, "file");

    if (rosterId.isEmpty() && xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing id or file");
      return;
    }

    // Resolve XML file from id if needed
    if (xmlFileName.isEmpty()) {
      RosterEntry rosterEntry = Roster.getDefault().entryFromTitle(rosterId);
      if (rosterEntry == null) {
        JsonUtil.err(response, 404, "roster id not found");
        return;
      }
      xmlFileName = n(rosterEntry.getFileName());
      if (xmlFileName.isEmpty()) {
        JsonUtil.err(response, 404, "file not found for id");
        return;
      }
    }

    File xmlPath = new File(RosterUtil.rosterFolder(), xmlFileName);

    String contentTypeHeader = header(request.getContentType());
    if (!contentTypeHeader.toLowerCase(Locale.ROOT).startsWith("multipart/")) {
      JsonUtil.err(response, 415, "multipart/form-data required");
      return;
    }
    String boundary = extractBoundary(contentTypeHeader);
    if (boundary == null) {
      JsonUtil.err(response, 400, "multipart boundary missing");
      return;
    }

    byte[] requestBody = readAll(request.getInputStream(), 20 * 1024 * 1024);
    PartData imagePart = findFilePart(requestBody, boundary, "image");
    if (imagePart == null || imagePart.data == null || imagePart.data.length == 0) {
      JsonUtil.err(response, 400, "missing image part");
      return;
    }

    // Use XML base to guarantee per-entry uniqueness
    String xmlBase = sanitizeBase(stripExt(xmlFileName));

    // Determine extension; default to .jpeg
    String extWithDot = RosterUtil.guessImageExt(imagePart.data, imagePart.filename);
    if (extWithDot == null || extWithDot.isBlank())
      extWithDot = ".jpeg";

    // New unique name: base + "-" + epochMillis + ext
    String finalImageName = uniqueImageName(xmlBase, extWithDot);

    // Remove previously referenced image (if any and not placeholder)
    String previousImageName = RosterUtil.readImageNameFromXml(xmlPath);
    if (previousImageName != null && !previousImageName.equals("_placeholder.png")
        && !previousImageName.equals(finalImageName)) {
      File previousImage = new File(RosterUtil.rosterFolder(), previousImageName);
      if (previousImage.exists() && previousImage.isFile())
        previousImage.delete();
    }

    // Save the new image and update XML references
    RosterUtil.saveImageAs(finalImageName, imagePart.data);
    RosterUtil.updateXmlIconRefs(xmlPath, finalImageName);

    // Refresh <dateUpdated> after changing image refs
    try {
      String xml = Files.readString(xmlPath.toPath(), StandardCharsets.UTF_8);
      int locoOpen = xml.indexOf("<locomotive ");
      if (locoOpen >= 0) {
        int locoOpenEnd = xml.indexOf(">", locoOpen);
        if (locoOpenEnd > locoOpen) {
          xml = upsertDateUpdated(xml, locoOpenEnd);
          Files.writeString(xmlPath.toPath(), xml, StandardCharsets.UTF_8);
        }
      }
    } catch (Exception ignore) {
    }

    // Extra cleanup: remove any other images reusing this base
    cleanupOldImagesForBase(xmlBase, finalImageName);

    Roster.getDefault().reindex();
    Roster.getDefault().writeRoster();

    JsonUtil.ok(response,
        "{\"ok\":true,\"file\":" + JsonUtil.quote(xmlFileName) + ",\"image\":" + JsonUtil.quote(finalImageName) + "}");
  }

  // ============================ POST /api/roster/update
  // ============================

  /**
   * Update common roster fields on the <locomotive ...> tag, reflect
   * <locoaddress>,
   * and refresh <dateUpdated> (milliseconds).
   */
  private void update(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String xmlFileName = opt(request, "file");
    if (xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing file");
      return;
    }

    String newId = opt(request, "id");
    String newAddress = opt(request, "address");
    String newRoadName = opt(request, "road");
    String newRoadNo = opt(request, "number");
    String newOwner = opt(request, "owner");
    String newModel = opt(request, "model");

    File xmlPath = new File(RosterUtil.rosterFolder(), xmlFileName);
    if (!xmlPath.exists()) {
      JsonUtil.err(response, 404, "xml not found");
      return;
    }

    String xml = Files.readString(xmlPath.toPath(), StandardCharsets.UTF_8);

    int locoOpenStart = xml.indexOf("<locomotive ");
    if (locoOpenStart < 0) {
      JsonUtil.err(response, 500, "invalid xml (no <locomotive>)");
      return;
    }
    int locoOpenEnd = xml.indexOf(">", locoOpenStart);
    if (locoOpenEnd < 0) {
      JsonUtil.err(response, 500, "invalid xml (unterminated <locomotive>)");
      return;
    }

    // Update attributes on <locomotive ...>
    String locomotiveOpenTag = xml.substring(locoOpenStart, locoOpenEnd);
    if (!newId.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "id", newId);
    if (!newAddress.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "dccAddress", newAddress);
    if (!newRoadName.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "roadName", newRoadName);
    if (!newRoadNo.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "roadNumber", newRoadNo);
    if (!newOwner.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "owner", newOwner);
    if (!newModel.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "model", newModel);

    // Normalize image attributes if they're already present
    locomotiveOpenTag = normalizeImageAttrsOnLocomotiveTag(locomotiveOpenTag);

    // Persist the modified opening tag
    xml = xml.substring(0, locoOpenStart) + locomotiveOpenTag + ">" + xml.substring(locoOpenEnd + 1);

    // Refresh loco open indexes (string length has changed)
    locoOpenStart = xml.indexOf("<locomotive ");
    locoOpenEnd = xml.indexOf(">", locoOpenStart);

    // Always refresh <dateUpdated> (milliseconds)
    xml = upsertDateUpdated(xml, locoOpenEnd);

    // Ensure <locoaddress> reflects any provided DCC address
    if (!newAddress.isEmpty()) {
      xml = upsertAddressBlocks(xml, locoOpenStart, locoOpenEnd, newAddress);
    }

    Files.writeString(xmlPath.toPath(), xml, StandardCharsets.UTF_8);
    Roster.getDefault().reindex();
    Roster.getDefault().writeRoster();

    JsonUtil.ok(response, "{\"ok\":true,\"file\":" + JsonUtil.quote(xmlFileName) + "}");
  }

  // ============================ FUNCTIONS ============================

  /** Return <functionlabels> as a simple JSON array. */
  private void functionsList(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String xmlFileName = opt(request, "file");
    String rosterId = opt(request, "id");

    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry entry = Roster.getDefault().entryFromTitle(rosterId);
      if (entry != null)
        xmlFileName = n(entry.getFileName());
    }
    if (xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing file or id");
      return;
    }

    File xmlFile = new File(RosterUtil.rosterFolder(), xmlFileName);
    if (!xmlFile.exists()) {
      JsonUtil.err(response, 404, "xml not found");
      return;
    }

    String xmlText = Files.readString(xmlFile.toPath(), StandardCharsets.UTF_8);

    int fnListStart = xmlText.indexOf("<functionlabels");
    if (fnListStart < 0) {
      JsonUtil.ok(response, "[]");
      return;
    }
    int fnOpenEnd = xmlText.indexOf(">", fnListStart);
    if (fnOpenEnd < 0) {
      JsonUtil.ok(response, "[]");
      return;
    }
    int fnListEnd = xmlText.indexOf("</functionlabels>", fnOpenEnd);
    if (fnListEnd < 0) {
      JsonUtil.ok(response, "[]");
      return;
    }

    String inner = xmlText.substring(fnOpenEnd + 1, fnListEnd);

    Pattern pattern = Pattern.compile("<functionlabel\\s+([^>]*)>(.*?)</functionlabel>",
        Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    Matcher matcher = pattern.matcher(inner);

    StringBuilder out = new StringBuilder(256);
    out.append("[");
    boolean first = true;
    while (matcher.find()) {
      String attrs = matcher.group(1);
      String labelText = matcher.group(2).trim();
      String num = getXmlAttr(attrs, "num");
      String lock = getXmlAttr(attrs, "lockable");
      String img = getXmlAttr(attrs, "functionImage");
      String imgS = getXmlAttr(attrs, "functionImageSelected");

      if (!first)
        out.append(',');
      first = false;

      out.append("{\"num\":").append(JsonUtil.quote(n(num)))
          .append(",\"label\":").append(JsonUtil.quote(n(labelText)))
          .append(",\"lockable\":").append("true".equalsIgnoreCase(n(lock)) ? "true" : "false")
          .append(",\"functionImage\":").append(JsonUtil.quote(n(img)))
          .append(",\"functionImageSelected\":").append(JsonUtil.quote(n(imgS)))
          .append("}");
    }
    out.append("]");
    JsonUtil.ok(response, out.toString());
  }

  /**
   * Replace <functionlabels> from form arrays.
   * Also refreshes <dateUpdated> (milliseconds) before saving.
   *
   * Expected repeated fields (use [] names on the client):
   * num[] label[] lockable[] img[] imgSel[]
   */
  // ============================ FUNCTIONS ============================

  /**
   * Replace <functionlabels> from form arrays.
   * Also refreshes <dateUpdated> (milliseconds) before saving.
   *
   * Expected repeated fields (x-www-form-urlencoded):
   * num[] label[] lockable[]
   */
  private void functionsSave(HttpServletRequest request, HttpServletResponse response) throws IOException {
    // Resolve XML file by file= or id=
    String xmlFileName = opt(request, "file");
    String rosterId = opt(request, "id");

    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry entry = Roster.getDefault().entryFromTitle(rosterId);
      if (entry != null)
        xmlFileName = n(entry.getFileName());
    }
    if (xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing file or id");
      return;
    }

    File xmlPath = new File(RosterUtil.rosterFolder(), xmlFileName);
    if (!xmlPath.exists()) {
      JsonUtil.err(response, 404, "xml not found");
      return;
    }

    // Read arrays from x-www-form-urlencoded
    String[] numbersArray = request.getParameterValues("num[]");
    String[] labelsArray = request.getParameterValues("label[]");
    String[] lockableArray = request.getParameterValues("lockable[]");

    int rowCount = maxLen(numbersArray, labelsArray, lockableArray);
    String xmlText = Files.readString(xmlPath.toPath(), StandardCharsets.UTF_8);

    // Always refresh <dateUpdated> on write (millisecond precision)
    int locoOpenStart = xmlText.indexOf("<locomotive ");
    int locoOpenEnd = (locoOpenStart >= 0) ? xmlText.indexOf(">", locoOpenStart) : -1;
    if (locoOpenEnd > locoOpenStart) {
      xmlText = upsertDateUpdated(xmlText, locoOpenEnd);
    }

    // If nothing supplied, remove the whole block and write back.
    if (rowCount <= 0) {
      xmlText = removeFunctionLabels(xmlText);
      xmlText = upsertDateMillis(xmlText); // keep <date> epoch-millis fresh too
      Files.writeString(xmlPath.toPath(), xmlText, StandardCharsets.UTF_8);
      Roster.getDefault().reindex();
      Roster.getDefault().writeRoster();
      JsonUtil.ok(response, "{\"ok\":true,\"removed\":true}");
      return;
    }

    // Collect, sanitize, and sort the rows we actually have numbers for.
    class FunctionRow {
      String functionNumber;
      String labelText;
      boolean lockable;
    }
    List<FunctionRow> rows = new ArrayList<>();
    for (int idx = 0; idx < rowCount; idx++) {
      String numberCandidate = at(numbersArray, idx);
      if (numberCandidate == null || numberCandidate.trim().isEmpty())
        continue;

      FunctionRow row = new FunctionRow();
      row.functionNumber = numberCandidate.trim();
      row.labelText = n(at(labelsArray, idx));
      String lockCandidate = n(at(lockableArray, idx));
      row.lockable = "true".equalsIgnoreCase(lockCandidate) || "on".equalsIgnoreCase(lockCandidate);
      rows.add(row);
    }

    // Sort numerically when possible, otherwise lexicographically
    Collections.sort(rows, (a, b) -> {
      try {
        return Integer.compare(Integer.parseInt(a.functionNumber), Integer.parseInt(b.functionNumber));
      } catch (Exception e) {
        return a.functionNumber.compareTo(b.functionNumber);
      }
    });

    // Build exactly what DecoderPro is happy with: attributes num + lockable; label
    // as element body.
    StringBuilder newBlock = new StringBuilder(256 + rows.size() * 64);
    newBlock.append("    <functionlabels>\n");
    for (FunctionRow row : rows) {
      newBlock.append("      <functionlabel num=\"").append(esc(row.functionNumber))
          .append("\" lockable=\"").append(row.lockable ? "true" : "false")
          .append("\">").append(esc(row.labelText)).append("</functionlabel>\n");
    }
    newBlock.append("    </functionlabels>\n");

    // Upsert at a friendly position, handling self-closing tags too.
    xmlText = upsertFunctionLabelsPreferred(xmlText, newBlock.toString());
    xmlText = upsertDateMillis(xmlText); // also keep <date> (epoch millis) up to date

    Files.writeString(xmlPath.toPath(), xmlText, StandardCharsets.UTF_8);
    Roster.getDefault().reindex();
    Roster.getDefault().writeRoster();
    JsonUtil.ok(response, "{\"ok\":true}");
  }

  /**
   * Insert/replace <functionlabels> in a friendly place:
   * 1) If it exists, replace it in-place.
   * 2) Else, insert BEFORE <soundlabels> if present.
   * 3) Else, after </locoaddress> if present.
   * 4) Else, just before </locomotive>.
   */
  /**
   * Insert/replace the <functionlabels> block in a friendly position.
   * Handles three cases:
   * 1) Existing open/close block -> replace it
   * 2) Existing self-closing tag -> expand it into the full block
   * 3) No tag present -> insert BEFORE <soundlabels>, or after </locoaddress>,
   * or just before </locomotive> as a fallback.
   */
  private static String upsertFunctionLabelsPreferred(String xml, String fullBlock) {
    final String OPEN = "<functionlabels";
    final String CLOSE = "</functionlabels>";

    int start = xml.indexOf(OPEN);
    if (start >= 0) {
      int openEnd = xml.indexOf(">", start);
      if (openEnd < 0)
        return xml; // malformed, bail safely

      // Detect self-closing: the last non-space before '>' is '/'
      int scan = openEnd - 1;
      while (scan > start && Character.isWhitespace(xml.charAt(scan)))
        scan--;
      boolean isSelfClosing = (scan > start && xml.charAt(scan) == '/');

      if (isSelfClosing) {
        // Replace exactly the self-closing tag with the full block.
        return xml.substring(0, start) + fullBlock + xml.substring(openEnd + 1);
      }

      // Otherwise expect a proper close tag; replace the whole block.
      int end = xml.indexOf(CLOSE, openEnd);
      if (end >= 0) {
        int endClose = end + CLOSE.length();
        return xml.substring(0, start) + fullBlock + xml.substring(endClose);
      }

      // Malformed but with an open tag: replace from open to just after '>'
      return xml.substring(0, start) + fullBlock + xml.substring(openEnd + 1);
    }

    // No <functionlabels> at all — choose an insertion point.
    int soundlabelsStart = xml.indexOf("<soundlabels");
    if (soundlabelsStart >= 0) {
      return xml.substring(0, soundlabelsStart) + fullBlock + xml.substring(soundlabelsStart);
    }

    int locoAddressClose = xml.indexOf("</locoaddress>");
    if (locoAddressClose >= 0) {
      locoAddressClose += "</locoaddress>".length();
      return xml.substring(0, locoAddressClose) + "\n" + fullBlock + xml.substring(locoAddressClose);
    }

    int locomotiveClose = xml.indexOf("</locomotive>");
    if (locomotiveClose >= 0) {
      return xml.substring(0, locomotiveClose) + fullBlock + xml.substring(locomotiveClose);
    }

    // Absolute fallback — append.
    return xml + "\n" + fullBlock;
  }

  /**
   * Insert or replace <date>...</date> (epoch millis) directly under
   * <locomotive>.
   */
  private static String upsertDateMillis(String xml) {
    int locoOpen = xml.indexOf("<locomotive ");
    if (locoOpen < 0)
      return xml;
    int locoOpenEnd = xml.indexOf(">", locoOpen);
    if (locoOpenEnd < 0)
      return xml;

    long now = System.currentTimeMillis();
    String dateLine = "    <date>" + now + "</date>\n";

    // If there's already a <date> right after the open tag, replace it
    int afterOpen = locoOpenEnd + 1;
    int existingStart = xml.indexOf("<date>", afterOpen);
    if (existingStart >= 0) {
      int existingEnd = xml.indexOf("</date>", existingStart);
      if (existingEnd > existingStart) {
        int close = existingEnd + "</date>".length();
        return xml.substring(0, existingStart) + "<date>" + now + "</date>" + xml.substring(close);
      }
    }
    // Otherwise insert just after the open tag
    return xml.substring(0, afterOpen) + dateLine + xml.substring(afterOpen);
  }

  // ============================ DECODER ============================

  /** Return decoder + identify info for the roster entry. */
  private void decoderInfo(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String xmlFileName = opt(request, "file");
    String rosterId = opt(request, "id");

    // Prefer a live roster entry lookup by id
    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry byId = Roster.getDefault().entryFromTitle(rosterId);
      if (byId != null) {
        try {
          byId.readFile();
        } catch (Exception ignore) {
        }
        writeDecoderJson(response, byId);
        return;
      }
    }

    // Otherwise require file name
    if (xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing file or id");
      return;
    }

    File xmlFile = new File(RosterUtil.rosterFolder(), xmlFileName);
    if (!xmlFile.exists()) {
      JsonUtil.err(response, 404, "xml not found");
      return;
    }

    try {
      RosterEntry entry = RosterEntry.fromFile(xmlFile);
      if (entry == null) {
        JsonUtil.err(response, 500, "failed to parse roster xml");
        return;
      }
      writeDecoderJson(response, entry);
    } catch (Exception ex) {
      JsonUtil.err(response, 500, "error: " + ex.getMessage());
    }
  }

  /**
   * POST /api/roster/decoder/save
   *
   * Request params:
   * - id OR file : locate the roster XML
   * - family, model : required (decoder tag)
   * - mfgName, mfgId/manufacturerID : optional (written on <locomotive ...>)
   * - productId/productID : optional (written on <locomotive ...>)
   * - modelId (→ developerID) : optional (written on <locomotive ...>)
   * - maxSpeed : optional (written on <locomotive ...>)
   * - dccAddress : optional (mirrors into <locoaddress>)
   *
   * Always refreshes <dateUpdated> (milliseconds).
   */
  private void decoderSave(HttpServletRequest request, HttpServletResponse response) throws IOException {
    String rosterId = opt(request, "id");
    String xmlFileName = opt(request, "file");

    // Decoder element fields
    String decoderFamily = opt(request, "family");
    String decoderModel = opt(request, "model");
    String decoderComment = firstNonEmpty(opt(request, "comment"), opt(request, "decoderComment"));

    // Identify fields (from read)
    String manufacturerName = opt(request, "mfgName");
    String manufacturerId = firstNonEmpty(opt(request, "mfgId"), opt(request, "manufacturerID"));
    String productId = firstNonEmpty(opt(request, "productId"), opt(request, "productID"));
    String developerId = opt(request, "modelId"); // JMRI expects developerID on <locomotive ...>

    // Extras
    String maxSpeed = opt(request, "maxSpeed");
    String dccAddress = opt(request, "dccAddress");

    if (decoderFamily.isEmpty() || decoderModel.isEmpty()) {
      JsonUtil.err(response, 400, "missing family/model");
      return;
    }

    // Resolve file name from id if necessary
    if (xmlFileName.isEmpty() && !rosterId.isEmpty()) {
      RosterEntry e = Roster.getDefault().entryFromTitle(rosterId);
      if (e != null)
        xmlFileName = n(e.getFileName());
    }
    if (xmlFileName.isEmpty()) {
      JsonUtil.err(response, 400, "missing file or id");
      return;
    }

    File xmlPath = new File(RosterUtil.rosterFolder(), xmlFileName);
    if (!xmlPath.exists()) {
      JsonUtil.err(response, 404, "xml not found");
      return;
    }

    String xml = Files.readString(xmlPath.toPath(), StandardCharsets.UTF_8);

    // Find <locomotive ...>
    int locoOpenStart = xml.indexOf("<locomotive ");
    int locoOpenEnd = (locoOpenStart >= 0) ? xml.indexOf(">", locoOpenStart) : -1;
    if (locoOpenStart < 0 || locoOpenEnd < 0) {
      JsonUtil.err(response, 500, "invalid xml (no <locomotive>)");
      return;
    }

    // Upsert identify attributes on <locomotive ...>
    String locomotiveOpenTag = xml.substring(locoOpenStart, locoOpenEnd);
    if (!manufacturerName.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "mfg", manufacturerName);
    if (!manufacturerId.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "manufacturerID", manufacturerId);
    if (!productId.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "productID", productId);
    if (!developerId.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "developerID", developerId);
    if (!maxSpeed.isEmpty())
      locomotiveOpenTag = setAttr(locomotiveOpenTag, "maxSpeed", maxSpeed);

    // Keep image attrs in JMRI style if present
    locomotiveOpenTag = normalizeImageAttrsOnLocomotiveTag(locomotiveOpenTag);

    // Persist the updated opening tag
    xml = xml.substring(0, locoOpenStart) + locomotiveOpenTag + ">" + xml.substring(locoOpenEnd + 1);
    // Recompute end index after replacement
    locoOpenEnd = locoOpenStart + locomotiveOpenTag.length();

    // Refresh <dateUpdated> (milliseconds)
    xml = upsertDateUpdated(xml, locoOpenEnd);

    // Upsert <decoder .../> just above <locoaddress>, with model/family/comment
    xml = upsertDecoderTag(xml, locoOpenEnd, decoderFamily, decoderModel, decoderComment);

    // Optional: update <locoaddress> block and reflect dccAddress on locomotive
    // attribute
    if (!dccAddress.isEmpty()) {
      xml = upsertAddressBlocks(xml, locoOpenStart, locoOpenEnd, dccAddress);
      // Also reflect "dccAddress" on <locomotive ...>
      locoOpenStart = xml.indexOf("<locomotive ");
      locoOpenEnd = xml.indexOf(">", locoOpenStart);
      String updatedOpen = xml.substring(locoOpenStart, locoOpenEnd);
      updatedOpen = setAttr(updatedOpen, "dccAddress", dccAddress);
      xml = xml.substring(0, locoOpenStart) + updatedOpen + ">" + xml.substring(locoOpenEnd + 1);
    }

    // Ensure <soundlabels/> exists
    xml = ensureSoundLabels(xml, locoOpenEnd);

    Files.writeString(xmlPath.toPath(), xml, StandardCharsets.UTF_8);
    Roster.getDefault().reindex();
    Roster.getDefault().writeRoster();

    String out = "{"
        + "\"ok\":true,"
        + "\"file\":" + JsonUtil.quote(xmlFileName) + ","
        + "\"locomotive\":{"
        + "\"mfg\":" + JsonUtil.quote(manufacturerName) + ","
        + "\"manufacturerID\":" + JsonUtil.quote(manufacturerId) + ","
        + "\"productID\":" + JsonUtil.quote(productId) + ","
        + "\"developerID\":" + JsonUtil.quote(developerId) + ","
        + "\"maxSpeed\":" + JsonUtil.quote(maxSpeed) + ","
        + "\"dccAddress\":" + JsonUtil.quote(dccAddress)
        + "},"
        + "\"decoder\":{"
        + "\"family\":" + JsonUtil.quote(decoderFamily) + ","
        + "\"model\":" + JsonUtil.quote(decoderModel)
        + "}"
        + "}";
    JsonUtil.ok(response, out);
  }

  // Build the decoder/identify JSON payload from a RosterEntry (+ XML attrs
  // fallback)
  private void writeDecoderJson(HttpServletResponse response, RosterEntry entry) throws IOException {
    try {
      entry.readFile();
    } catch (Exception ignore) {
    }

    // Pull attributes directly from the <locomotive ...> tag when needed
    String locoOpenTag = "";
    String xmlFileName = n(entry.getFileName());
    if (!xmlFileName.isEmpty()) {
      File xmlFile = new File(RosterUtil.rosterFolder(), xmlFileName);
      if (xmlFile.exists()) {
        try {
          locoOpenTag = findLocomotiveOpenTagFromFile(xmlFile);
        } catch (Exception ignore) {
        }
      }
    }

    // Prefer RosterEntry getters; fall back to attributes on <locomotive ...>
    String mfgName = firstNonEmpty(n(entry.getMfg()), n(getXmlAttr(locoOpenTag, "mfg")));
    String mfgId = firstNonEmpty(n(entry.getManufacturerID()), n(getXmlAttr(locoOpenTag, "manufacturerID")));
    String productId = firstNonEmpty(n(entry.getProductID()), n(getXmlAttr(locoOpenTag, "productID")));
    String modelId = n(getXmlAttr(locoOpenTag, "developerID")); // saved only in XML attrs

    StringBuilder out = new StringBuilder(640);
    out.append("{\"ok\":true")
        .append(",\"id\":").append(JsonUtil.quote(n(entry.getId())))
        .append(",\"fileName\":").append(JsonUtil.quote(xmlFileName))
        .append(",\"decoder\":{")
        .append("\"manufacturer\":").append(JsonUtil.quote(n(entry.getMfg())))
        .append(",\"family\":").append(JsonUtil.quote(n(entry.getDecoderFamily())))
        .append(",\"model\":").append(JsonUtil.quote(n(entry.getDecoderModel())))
        .append(",\"manufacturerId\":").append(JsonUtil.quote(n(entry.getManufacturerID())))
        .append(",\"productId\":").append(JsonUtil.quote(n(entry.getProductID())))
        .append("}")
        .append(",\"identify\":{")
        .append("\"mfgName\":").append(JsonUtil.quote(mfgName))
        .append(",\"mfgId\":").append(JsonUtil.quote(mfgId))
        .append(",\"modelId\":").append(JsonUtil.quote(modelId))
        .append(",\"productId\":").append(JsonUtil.quote(productId))
        .append("}")
        .append("}");

    JsonUtil.ok(response, out.toString());
  }

  // ============================ Helpers: timestamps & baseline
  // ============================

  // Millisecond ISO-8601 formatter like "2025-09-08T10:23:14.369+01:00"
  private static final java.time.format.DateTimeFormatter ISO_OFFSET_MILLIS = java.time.format.DateTimeFormatter
      .ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");

  private static String nowIsoOffsetMillis() {
    return java.time.OffsetDateTime.now()
        .truncatedTo(java.time.temporal.ChronoUnit.MILLIS)
        .format(ISO_OFFSET_MILLIS);
  }

  /**
   * Insert or replace <dateUpdated> immediately after the <locomotive> open tag.
   */
  private static String upsertDateUpdated(String xml, int locoOpenEnd) {
    int afterOpen = locoOpenEnd + 1;
    int duStart = xml.indexOf("<dateUpdated>", afterOpen);
    int nextTag = xml.indexOf("<", afterOpen);
    boolean isNextTagDateUpdated = (duStart == nextTag);

    String du = "    <dateUpdated>" + esc(nowIsoOffsetMillis()) + "</dateUpdated>\n";

    if (isNextTagDateUpdated) {
      int duEnd = xml.indexOf("</dateUpdated>", duStart);
      if (duEnd > duStart) {
        int duClose = duEnd + "</dateUpdated>".length();
        return xml.substring(0, duStart) + du + xml.substring(duClose);
      }
    }
    return xml.substring(0, afterOpen) + du + xml.substring(afterOpen);
  }

  /** Ensure <functionlabels /> exists (empty is fine). */
  private static String ensureFunctionLabelsPresent(String xml, int locoOpenEnd) {
    if (xml.indexOf("<functionlabels", locoOpenEnd + 1) >= 0)
      return xml;
    String block = "    <functionlabels />\n";
    int addrEnd = xml.indexOf("</locoaddress>", locoOpenEnd + 1);
    int insertPos = (addrEnd >= 0) ? (addrEnd + "</locoaddress>".length()) : (locoOpenEnd + 1);
    int duStart = xml.indexOf("<dateUpdated>", locoOpenEnd + 1);
    if (duStart >= 0) {
      int duEnd = xml.indexOf("</dateUpdated>", duStart);
      if (duEnd > duStart)
        insertPos = duEnd + "</dateUpdated>".length();
    }
    return xml.substring(0, insertPos) + "\n" + block + xml.substring(insertPos);
  }

  /**
   * Ensure <soundlabels /> exists after functionlabels (or after locoaddress if
   * none).
   */
  private static String ensureSoundLabels(String xml, int locoOpenEnd) {
    int soundStart = xml.indexOf("<soundlabels", locoOpenEnd + 1);
    if (soundStart >= 0)
      return xml; // already present
    int fnStart = xml.indexOf("<functionlabels", locoOpenEnd + 1);
    int fnEnd = (fnStart >= 0) ? xml.indexOf("</functionlabels>", fnStart) : -1;
    String block = "    <soundlabels />\n";
    int insertPos;
    if (fnStart >= 0 && fnEnd > fnStart) {
      insertPos = fnEnd + "</functionlabels>".length();
    } else {
      int addrStart = xml.indexOf("<locoaddress", locoOpenEnd + 1);
      int addrEnd = (addrStart >= 0) ? xml.indexOf("</locoaddress>", addrStart) : -1;
      insertPos = (addrEnd > 0) ? addrEnd + "</locoaddress>".length() : (locoOpenEnd + 1);
    }
    return xml.substring(0, insertPos) + "\n" + block + xml.substring(insertPos);
  }

  /** Ensure <values /> exists (empty is fine). */
  private static String ensureValuesPresent(String xml, int locoOpenEnd) {
    if (xml.indexOf("<values", locoOpenEnd + 1) >= 0)
      return xml;
    String block = "    <values />\n";
    int soundEnd = xml.indexOf("</soundlabels>", locoOpenEnd + 1);
    int insertPos = (soundEnd >= 0) ? (soundEnd + "</soundlabels>".length()) : -1;
    if (insertPos < 0) {
      int fnEnd = xml.indexOf("</functionlabels>", locoOpenEnd + 1);
      insertPos = (fnEnd >= 0) ? (fnEnd + "</functionlabels>".length()) : -1;
    }
    if (insertPos < 0) {
      int addrEnd = xml.indexOf("</locoaddress>", locoOpenEnd + 1);
      insertPos = (addrEnd >= 0) ? (addrEnd + "</locoaddress>".length()) : (locoOpenEnd + 1);
    }
    return xml.substring(0, insertPos) + "\n" + block + xml.substring(insertPos);
  }

  /** Compose: dateUpdated + functionlabels + soundlabels + values. */
  private static String ensureBaselineSections(String xml) {
    int locoOpen = xml.indexOf("<locomotive ");
    if (locoOpen < 0)
      return xml;
    int locoOpenEnd = xml.indexOf(">", locoOpen);
    if (locoOpenEnd < 0)
      return xml;

    xml = upsertDateUpdated(xml, locoOpenEnd);
    xml = ensureFunctionLabelsPresent(xml, locoOpenEnd);
    xml = ensureSoundLabels(xml, locoOpenEnd);
    xml = ensureValuesPresent(xml, locoOpenEnd);
    return xml;
  }

  /**
   * Read-modify-write: guarantee baseline sections on a file (used during add).
   */
  private static void ensureBaselineOnFile(File xmlPath) throws IOException {
    String xml = Files.readString(xmlPath.toPath(), StandardCharsets.UTF_8);
    xml = ensureBaselineSections(xml);
    Files.writeString(xmlPath.toPath(), xml, StandardCharsets.UTF_8);
  }

  // ============================ Helpers: XML structure
  // ============================

  /** Read the <locomotive ...> open tag (without the closing '>') from a file. */
  private static String findLocomotiveOpenTagFromFile(File xmlFile) throws IOException {
    String xmlText = Files.readString(xmlFile.toPath(), StandardCharsets.UTF_8);
    int start = xmlText.indexOf("<locomotive ");
    if (start < 0)
      return "";
    int end = xmlText.indexOf(">", start);
    if (end < 0)
      return "";
    return xmlText.substring(start, end);
  }

  /**
   * If iconFilePath looks like 'preference:roster/<file.ext>', normalize JMRI
   * attrs.
   */
  private static String normalizeImageAttrsOnLocomotiveTag(String locoOpenTag) {
    String icon = getXmlAttr(locoOpenTag, "iconFilePath");
    String img = getXmlAttr(locoOpenTag, "imageFilePath");

    String candidate = (icon != null && !icon.isEmpty()) ? icon : img;
    if (candidate != null && candidate.startsWith("preference:roster/")) {
      String file = candidate.substring("preference:roster/".length());
      int dot = file.lastIndexOf('.');
      String base = (dot > 0) ? file.substring(0, dot) : file;
      locoOpenTag = setAttr(locoOpenTag, "imageFilePath", base);
      locoOpenTag = setAttr(locoOpenTag, "iconFilePath", "preference:roster/" + file);
    }
    return locoOpenTag;
  }

  /**
   * Upsert locoaddress block and reflect protocol/longaddress from a DCC address.
   */
  private static String upsertAddressBlocks(String xml, int locoOpenStart, int locoOpenEnd, String dccAddress) {
    int locoClose = xml.indexOf("</locomotive>", locoOpenEnd);
    if (locoClose < 0)
      return xml;

    int addrStart = xml.indexOf("<locoaddress", locoOpenEnd);
    int addrEnd = (addrStart >= 0) ? xml.indexOf("</locoaddress>", addrStart) : -1;

    boolean longAddr = isLong(dccAddress);
    String longYesNo = longAddr ? "yes" : "no";
    String protocol = longAddr ? "dcc_long" : "dcc_short";
    String addressText = n(dccAddress);

    if (addrStart < 0 || addrEnd < 0) {
      String block = "    <locoaddress>\n"
          + "      <dcclocoaddress number=\"" + esc(addressText) + "\" longaddress=\"" + longYesNo + "\" />\n"
          + "      <number>" + esc(addressText) + "</number>\n"
          + "      <protocol>" + protocol + "</protocol>\n"
          + "    </locoaddress>\n";
      return xml.substring(0, locoOpenEnd + 1) + block + xml.substring(locoOpenEnd + 1);
    } else {
      addrEnd = xml.indexOf("</locoaddress>", addrStart);
      int addrClose = addrEnd + "</locoaddress>".length();
      String locoAddressBlock = xml.substring(addrStart, addrClose);
      locoAddressBlock = upsertAttrOnTag(locoAddressBlock, "dcclocoaddress", "number", addressText);
      locoAddressBlock = upsertAttrOnTag(locoAddressBlock, "dcclocoaddress", "longaddress", longYesNo);
      locoAddressBlock = upsertSimpleElement(locoAddressBlock, "number", addressText);
      locoAddressBlock = upsertSimpleElement(locoAddressBlock, "protocol", protocol);
      return xml.substring(0, addrStart) + locoAddressBlock + xml.substring(addrClose);
    }
  }

  /**
   * Ensure a self-closing <decoder .../> exists just above <locoaddress>.
   * It contains only model, family, and optional comment (in that order).
   * If a <decoder ...> already exists anywhere, it is removed first so
   * we can reinsert it in the canonical location.
   *
   * @param xml         full roster file text
   * @param locoOpenEnd index of '>' for the <locomotive ...> open tag
   * @param family      decoder family (required)
   * @param model       decoder model (required)
   * @param comment     optional comment; omitted if blank
   * @return updated xml text
   */
  private static String upsertDecoderTag(String xml, int locoOpenEnd, String family, String model, String comment) {
    // 1) Remove any existing <decoder ...> open tag (assumed self-closing in JMRI)
    int decStart = xml.indexOf("<decoder", locoOpenEnd + 1);
    if (decStart >= 0) {
      int decEnd = xml.indexOf(">", decStart);
      if (decEnd >= 0) {
        xml = xml.substring(0, decStart) + xml.substring(decEnd + 1);
      }
    }

    // 2) Build new tag with attributes in canonical order: model, family, comment
    StringBuilder tag = new StringBuilder(128);
    tag.append("    <decoder")
        .append(" model=\"").append(esc(model)).append("\"")
        .append(" family=\"").append(esc(family)).append("\"");
    String c = n(comment).trim();
    if (!c.isEmpty()) {
      tag.append(" comment=\"").append(esc(c)).append("\"");
    }
    tag.append(" />\n");

    // 3) Insert BEFORE <locoaddress> if present; else right after <locomotive> open
    int addrStart = xml.indexOf("<locoaddress", locoOpenEnd + 1);
    int insertPos = (addrStart >= 0) ? addrStart : (locoOpenEnd + 1);

    return xml.substring(0, insertPos) + tag.toString() + xml.substring(insertPos);
  }

  private static String n(String s) {
    return s == null ? "" : s;
  }

  private static String header(String s) {
    return s == null ? "" : s;
  }

  private static String opt(HttpServletRequest req, String key) {
    String v = req.getParameter(key);
    return v == null ? "" : v.trim();
  }

  // Flexible helpers that were missing in your build:

  private static String firstNonEmpty(String... vals) {
    if (vals == null)
      return "";
    for (String v : vals)
      if (v != null && !v.trim().isEmpty())
        return v.trim();
    return "";
  }

  private static int maxLen(String[]... arrays) {
    int m = 0;
    for (String[] a : arrays)
      if (a != null && a.length > m)
        m = a.length;
    return m;
  }

  private static String at(String[] a, int i) {
    return (a != null && i < a.length) ? a[i] : null;
  }

  private static String stripExt(String fileName) {
    int i = fileName.lastIndexOf('.');
    return i > 0 ? fileName.substring(0, i) : fileName;
  }

  private static String esc(String s) {
    return escapeXml(s);
  }

  private static String escapeXml(String s) {
    return s == null ? ""
        : s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;");
  }

  private static boolean isLong(String addr) {
    if (addr == null)
      return false;
    try {
      return Integer.parseInt(addr.trim()) > 127;
    } catch (Exception e) {
      return false;
    }
  }

  /**
   * Minimal XML used for quick-add; includes baseline sections and dateUpdated.
   */
  private static String minimalXml(String id, String fileName, String road, String number, String owner, String model,
      String address) {
    boolean longAddr = isLong(address);
    String longYesNo = longAddr ? "yes" : "no";
    String protocol = longAddr ? "dcc_long" : "dcc_short";
    String date = esc(nowIsoOffsetMillis());

    return ""
        + "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
        + "<!DOCTYPE locomotive-config SYSTEM \"/xml/DTD/locomotive-config.dtd\">\n"
        + "<locomotive-config xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:noNamespaceSchemaLocation=\"http://jmri.org/xml/schema/locomotive-config.xsd\">\n"
        + "  <locomotive id=\"" + esc(id) + "\" fileName=\"" + esc(fileName)
        + "\" roadNumber=\"" + esc(n(number)) + "\" roadName=\"" + esc(n(road))
        + "\" owner=\"" + esc(n(owner)) + "\" model=\"" + esc(n(model))
        + "\" dccAddress=\"" + esc(n(address)) + "\">\n"
        + "    <dateUpdated>" + date + "</dateUpdated>\n"
        + "    <locoaddress>\n"
        + "      <dcclocoaddress number=\"" + esc(n(address)) + "\" longaddress=\"" + longYesNo + "\" />\n"
        + "      <number>" + esc(n(address)) + "</number>\n"
        + "      <protocol>" + protocol + "</protocol>\n"
        + "    </locoaddress>\n"
        + "    <functionlabels />\n"
        + "    <soundlabels />\n"
        + "    <values />\n"
        + "  </locomotive>\n"
        + "</locomotive-config>\n";
  }

  /** Set or add an attribute on a tag-open snippet (no trailing '>'). */
  private static String setAttr(String tagOpen, String name, String value) {
    String needle = name + "=\"";
    int at = tagOpen.indexOf(needle);
    if (at >= 0) {
      int valStart = at + needle.length();
      int valEnd = tagOpen.indexOf("\"", valStart);
      if (valEnd > valStart) {
        return tagOpen.substring(0, valStart) + escapeXml(value) + tagOpen.substring(valEnd);
      }
    }
    return tagOpen + " " + name + "=\"" + escapeXml(value) + "\"";
  }

  /** Upsert a simple <elem>text</elem> inside a snippet block. */
  private static String upsertSimpleElement(String xmlSnippet, String elem, String text) {
    String open = "<" + elem + ">";
    String close = "</" + elem + ">";
    int a = xmlSnippet.indexOf(open);
    int b = xmlSnippet.indexOf(close, a + open.length());
    if (a >= 0 && b > a) {
      return xmlSnippet.substring(0, a + open.length()) + escapeXml(text) + xmlSnippet.substring(b);
    } else {
      int ins = xmlSnippet.indexOf("</locoaddress>");
      if (ins < 0)
        return xmlSnippet;
      String block = "      " + open + escapeXml(text) + close + "\n";
      return xmlSnippet.substring(0, ins) + block + xmlSnippet.substring(ins);
    }
  }

  /** Upsert an attribute on a specific child tag within a snippet block. */
  private static String upsertAttrOnTag(String xmlSnippet, String tagName, String attr, String val) {
    String open = "<" + tagName;
    int t = xmlSnippet.indexOf(open);
    if (t < 0) {
      String line = "      <" + tagName + " " + attr + "=\"" + escapeXml(val) + "\" />\n";
      int ins = xmlSnippet.indexOf("</locoaddress>");
      if (ins < 0)
        return xmlSnippet;
      return xmlSnippet.substring(0, ins) + line + xmlSnippet.substring(ins);
    }
    int tagEnd = xmlSnippet.indexOf(">", t);
    if (tagEnd < 0)
      return xmlSnippet;
    String tag = xmlSnippet.substring(t, tagEnd);
    tag = setAttr(tag, attr, val);
    return xmlSnippet.substring(0, t) + tag + xmlSnippet.substring(tagEnd);
  }

  /** Extract an attribute value from a tag-open string (no trailing '>'). */
  private static String getXmlAttr(String attrs, String name) {
    String needle = name + "=\"";
    int i = attrs.indexOf(needle);
    if (i < 0)
      return null;
    int s = i + needle.length();
    int e = attrs.indexOf("\"", s);
    if (e <= s)
      return null;
    return attrs.substring(s, e);
  }

  /** Replace an existing <functionlabels> block (or insert a new one). */
  private static String upsertFunctionLabels(String xml, String block) {
    int start = xml.indexOf("<functionlabels");
    if (start >= 0) {
      int openEnd = xml.indexOf(">", start);
      if (openEnd < 0)
        return xml;
      int end = xml.indexOf("</functionlabels>", openEnd);
      if (end < 0)
        return xml;
      int endClose = end + "</functionlabels>".length();
      return xml.substring(0, start) + block + xml.substring(endClose);
    }
    int afterLocoAddress = xml.indexOf("</locoaddress>");
    if (afterLocoAddress >= 0) {
      afterLocoAddress += "</locoaddress>".length();
      return xml.substring(0, afterLocoAddress) + "\n" + block + xml.substring(afterLocoAddress);
    }
    int beforeClose = xml.indexOf("</locomotive>");
    if (beforeClose >= 0) {
      return xml.substring(0, beforeClose) + block + xml.substring(beforeClose);
    }
    return xml + "\n" + block;
  }

  /** Remove the entire <functionlabels> block (no-op if missing). */
  private static String removeFunctionLabels(String xml) {
    int start = xml.indexOf("<functionlabels");
    if (start < 0)
      return xml;
    int openEnd = xml.indexOf(">", start);
    if (openEnd < 0)
      return xml;
    int end = xml.indexOf("</functionlabels>", openEnd);
    if (end < 0)
      return xml;
    int endClose = end + "</functionlabels>".length();
    return xml.substring(0, start) + xml.substring(endClose);
  }

  // ============================ Helpers: multipart & files
  // ============================

  private static class PartData {
    String name;
    String filename;
    byte[] data;
  }

  private static String extractBoundary(String contentTypeHeader) {
    for (String part : contentTypeHeader.split(";")) {
      String trimmed = part.trim();
      if (trimmed.toLowerCase(Locale.ROOT).startsWith("boundary=")) {
        String b = trimmed.substring(9).trim();
        if (b.startsWith("\"") && b.endsWith("\"") && b.length() >= 2) {
          b = b.substring(1, b.length() - 1);
        }
        return b;
      }
    }
    return null;
  }

  /** Very simple multipart finder for a file part named expectedName. */
  private static PartData findFilePart(byte[] body, String boundary, String expectedName) {
    String s = new String(body, java.nio.charset.StandardCharsets.ISO_8859_1);
    String b = "--" + boundary;
    int idx = s.indexOf(b);
    while (idx >= 0) {
      idx += b.length();
      if (s.startsWith("--", idx))
        break; // end marker
      if (s.startsWith("\r\n", idx))
        idx += 2;

      int headersEnd = s.indexOf("\r\n\r\n", idx);
      if (headersEnd < 0)
        break;
      String headers = s.substring(idx, headersEnd);

      int contentStart = headersEnd + 4;
      int next = s.indexOf("\r\n" + b, contentStart);
      if (next < 0)
        next = s.length();
      String contentStr = s.substring(contentStart, next);
      if (contentStr.endsWith("\r\n"))
        contentStr = contentStr.substring(0, contentStr.length() - 2);

      String partName = null, fileName = null;
      for (String line : headers.split("\r\n")) {
        String lower = line.toLowerCase(Locale.ROOT);
        if (lower.startsWith("content-disposition:")) {
          for (String kv : line.split(";")) {
            String t = kv.trim();
            if (t.startsWith("name="))
              partName = unquote(t.substring(5));
            if (t.startsWith("filename="))
              fileName = unquote(t.substring(9));
          }
        }
      }

      if (fileName != null && (expectedName == null || expectedName.equals(partName))) {
        PartData pd = new PartData();
        pd.name = partName;
        pd.filename = fileName;
        pd.data = contentStr.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        return pd;
      }

      int nextBoundary = s.indexOf(b, next + 2);
      if (nextBoundary < 0)
        break;
      idx = nextBoundary;
    }
    return null;
  }

  private static String unquote(String v) {
    v = v.trim();
    if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.substring(1, v.length() - 1);
    }
    return v;
  }

  private static String contentTypeFor(String name) {
    String n = name.toLowerCase(Locale.ROOT);
    if (n.endsWith(".png"))
      return "image/png";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg"))
      return "image/jpeg";
    if (n.endsWith(".gif"))
      return "image/gif";
    if (n.endsWith(".webp"))
      return "image/webp";
    if (n.endsWith(".svg"))
      return "image/svg+xml";
    return "application/octet-stream";
  }

  private static String suggestXmlName(String suggested, String fallback) {
    if (suggested == null || suggested.isEmpty())
      return fallback;
    String s = suggested;
    int slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (slash >= 0)
      s = s.substring(slash + 1);
    if (!s.toLowerCase(Locale.ROOT).endsWith(".xml"))
      s += ".xml";
    return s;
  }

  private static byte[] readAll(InputStream is, int maxBytes) throws IOException {
    ByteArrayOutputStream baos = new ByteArrayOutputStream(Math.min(maxBytes, 1 << 20));
    byte[] buf = new byte[8192];
    int n, total = 0;
    while ((n = is.read(buf)) != -1) {
      total += n;
      if (total > maxBytes)
        throw new IOException("multipart too large");
      baos.write(buf, 0, n);
    }
    return baos.toByteArray();
  }

  // ============================ Helpers: image housekeeping
  // ============================

  /**
   * Normalize string to a safe filename base: NFKD, strip diacritics, keep
   * [A-Za-z0-9._-], collapse/trim.
   */
  private static String sanitizeBase(String input) {
    if (input == null || input.isBlank())
      return "unnamed";
    String noAccents = Normalizer.normalize(input, Normalizer.Form.NFKD).replaceAll("\\p{M}+", "");
    String safe = noAccents
        .replaceAll("[^A-Za-z0-9._-]+", "_")
        .replaceAll("_+", "_")
        .replaceAll("(^[._-]+|[._-]+$)", "");
    return safe.isBlank() ? "unnamed" : safe;
  }

  /** Sanitize a suggested file name and ensure it ends with ".xml". */
  private static String sanitizeToFile(String suggested) {
    if (suggested == null || suggested.trim().isEmpty())
      return "unnamed.xml";
    String s = suggested.trim();

    // Prevent paths; normalize to a safe base
    s = s.replace('\\', '_').replace('/', '_');
    String base = sanitizeBase(s);

    // Ensure .xml suffix
    if (!base.toLowerCase(Locale.ROOT).endsWith(".xml")) {
      base += ".xml";
    }
    // Avoid empty result
    return base.isBlank() ? "unnamed.xml" : base;
  }

  /** Build unique image filename: base + "-" + epochMillis + extension. */
  private static String uniqueImageName(String base, String extWithDot) {
    long ts = System.currentTimeMillis();
    String ext = (extWithDot == null || extWithDot.isBlank()) ? ".jpeg" : extWithDot.toLowerCase(Locale.ROOT);
    return base + "-" + ts + ext;
  }

  /** True if name ends with a known image extension. */
  private static boolean hasKnownImageExt(String name) {
    String n = name.toLowerCase(Locale.ROOT);
    return n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg")
        || n.endsWith(".gif") || n.endsWith(".webp") || n.endsWith(".svg");
  }

  /**
   * Remove any files in the roster folder that look like older images
   * for the same entry (same base prefix) except the file we just created.
   * Also removes a legacy non-timestamped "<base>.<ext>" if present.
   */
  private static void cleanupOldImagesForBase(String basePrefix, String keepFileName) {
    File dir = RosterUtil.rosterFolder();
    File[] files = dir.listFiles();
    if (files == null)
      return;

    for (File f : files) {
      if (!f.isFile())
        continue;
      String name = f.getName();
      if (name.equals(keepFileName))
        continue;
      if (!hasKnownImageExt(name))
        continue;

      boolean matchesTimestampPattern = name.startsWith(basePrefix + "-");
      boolean matchesLegacyBase = stripExt(name).equals(basePrefix);

      if (matchesTimestampPattern || matchesLegacyBase) {
        try {
          f.delete();
        } catch (Exception ignore) {
        }
      }
    }
  }

  // ============================ Small holder for functions
  // ============================

  private static class Fn {
    String num, lab, img, imgS;
    boolean lock;
  }
}
