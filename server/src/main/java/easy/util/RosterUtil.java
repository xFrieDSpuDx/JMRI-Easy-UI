package dev.yourname.jmri.easy.util;

import jmri.jmrit.roster.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

public final class RosterUtil {
  private RosterUtil(){}

  /** Folder where roster XML files and images live. */
  public static File rosterFolder(){ return new File(LocoFile.getFileLocation()); }

  /** Save an XML file as-is into the roster folder. Overwrites if exists. */
  public static File saveXml(String fileName, byte[] data) throws IOException{
    if(fileName==null||fileName.trim().isEmpty()) throw new IOException("Missing fileName");
    File out = new File(rosterFolder(), fileName);
    try(FileOutputStream fos=new FileOutputStream(out)){ fos.write(data); }
    return out;
  }

  /** Save image with an exact name (overwrite if exists). Returns that name. */
  public static String saveImageAs(String exactName, byte[] data) throws IOException {
    if (data==null || data.length==0) throw new IOException("Empty image");
    if (exactName==null || exactName.trim().isEmpty()) throw new IOException("Missing image name");
    File out = new File(rosterFolder(), exactName);
    try(FileOutputStream fos = new FileOutputStream(out)){ fos.write(data); }
    return exactName;
  }

  /** Save an image with a suggested name; uniquify if taken. Returns final name. */
  public static String saveImageUnique(String suggestedName, byte[] data) throws IOException {
    if (data==null || data.length==0) throw new IOException("Empty image");
    String base = sanitizeBase(stripExt(suggestedName==null? "roster_image" : suggestedName));
    String ext  = guessImageExt(data, suggestedName);
    String name = base + ext;
    File out = new File(rosterFolder(), name);
    int i=1;
    while(out.exists()){ name = base + "_" + (i++) + ext; out = new File(rosterFolder(), name); }
    try(FileOutputStream fos = new FileOutputStream(out)){ fos.write(data); }
    return name;
  }

  /** Wire image into <locomotive ...> as iconFilePath & imageFilePath (preference:roster/IMAGE). */
  public static boolean updateXmlIconRefs(File xmlFile, String imageFileName) throws IOException {
    if (xmlFile==null || !xmlFile.exists()) return false;
    String xml = Files.readString(xmlFile.toPath(), StandardCharsets.UTF_8);
    int open = xml.indexOf("<locomotive ");
    if (open < 0) return false;
    int end = xml.indexOf(">", open);
    if (end < 0) return false;

    String tag = xml.substring(open, end); // without '>'
    String prefPath = "preference:roster/" + imageFileName;

    tag = setAttr(tag, "imageFilePath", prefPath);
    tag = setAttr(tag, "iconFilePath",  prefPath);

    String updated = xml.substring(0, open) + tag + ">" + xml.substring(end+1);
    Files.writeString(xmlFile.toPath(), updated, StandardCharsets.UTF_8);
    return true;
  }

  /** Read current image filename from XML (returns just "Foo.jpg" or null). */
  public static String readImageNameFromXml(File xmlFile) {
    try {
      if (xmlFile==null || !xmlFile.exists()) return null;
      String xml = Files.readString(xmlFile.toPath(), StandardCharsets.UTF_8);
      int open = xml.indexOf("<locomotive ");
      if (open < 0) return null;
      int end = xml.indexOf(">", open);
      if (end < 0) return null;
      String tag = xml.substring(open, end); // attrs only

      String raw = getAttr(tag, "iconFilePath");
      if (raw==null || raw.isEmpty()) raw = getAttr(tag, "imageFilePath");
      if (raw==null || raw.isEmpty()) return null;

      final String pref = "preference:roster/";
      return raw.startsWith(pref) ? raw.substring(pref.length()) : raw;
    } catch (Exception e) { return null; }
  }

  /** Ensure placeholder image exists; return its file name. */
  public static String ensurePlaceholder() throws IOException {
    String name = "_placeholder.png";
    File f = new File(rosterFolder(), name);
    if (!f.exists()) {
      byte[] png = java.util.Base64.getDecoder().decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
      );
      try(FileOutputStream fos = new FileOutputStream(f)){ fos.write(png); }
    }
    return name;
  }

  /** Delete a roster entry (XML and index; remove image file only if you call it yourself). */
  public static boolean deleteEntry(String id, String fileName){
    Roster roster = Roster.getDefault();
    RosterEntry entry = (id!=null && !id.isEmpty()) ? roster.entryFromTitle(id) : null;
    if(entry==null && fileName!=null && !fileName.isEmpty()){
      try{ entry = RosterEntry.fromFile(new File(rosterFolder(), fileName)); }catch(Exception ignored){}
    }
    boolean fileDeleted = true;
    if(fileName==null||fileName.isEmpty()){ if(entry!=null) fileName = entry.getFileName(); }
    if(fileName!=null && !fileName.isEmpty()){
      File f = new File(rosterFolder(), fileName);
      fileDeleted = (!f.exists()) || f.delete();
    }
    if(entry!=null) roster.removeEntry(entry);
    roster.reindex(); roster.writeRoster();
    return fileDeleted;
  }

  // --------- helpers ----------
  private static String setAttr(String tag, String name, String value){
    String needle = name + "=\"";
    int at = tag.indexOf(needle);
    if (at >= 0){
      int valStart = at + needle.length();
      int valEnd = tag.indexOf("\"", valStart);
      if (valEnd > valStart) {
        return tag.substring(0, valStart) + escapeXml(value) + tag.substring(valEnd);
      }
    }
    return tag + " " + name + "=\"" + escapeXml(value) + "\"";
  }

  private static String getAttr(String tag, String name){
    String needle = name + "=\"";
    int at = tag.indexOf(needle);
    if (at < 0) return null;
    int valStart = at + needle.length();
    int valEnd = tag.indexOf("\"", valStart);
    if (valEnd <= valStart) return null;
    return tag.substring(valStart, valEnd);
  }

  public static String escapeXml(String s){ return s==null? "" : s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;"); }
  public static String sanitizeBase(String s){ return s.replaceAll("[\\\\/:*?\"<>|#%]","_").replaceAll("\\s+","_"); }
  private static String stripExt(String fn){ int i=fn==null? -1 : fn.lastIndexOf('.'); return i>0? fn.substring(0,i): (fn==null?"":fn); }

  public static String guessImageExt(byte[] b, String suggested){
    if (b.length>=2 && (b[0]&0xFF)==0xFF && (b[1]&0xFF)==0xD8) return ".jpg";           // JPEG
    if (b.length>=8 && b[0]==(byte)0x89 && b[1]==0x50 && b[2]==0x4E && b[3]==0x47) return ".png"; // PNG
    if (b.length>=4 && b[0]=='G' && b[1]=='I' && b[2]=='F' && b[3]=='8') return ".gif"; // GIF
    if (b.length>=12 && b[0]=='R' && b[1]=='I' && b[2]=='F' && b[3]=='F' && b[8]=='W' && b[9]=='E' && b[10]=='B' && b[11]=='P') return ".webp"; // WEBP
    if (suggested!=null){
      String lower = suggested.toLowerCase();
      if (lower.endsWith(".jpg")||lower.endsWith(".jpeg")) return ".jpg";
      if (lower.endsWith(".png")) return ".png";
      if (lower.endsWith(".gif")) return ".gif";
      if (lower.endsWith(".webp")) return ".webp";
    }
    return ".jpg";
  }
}
