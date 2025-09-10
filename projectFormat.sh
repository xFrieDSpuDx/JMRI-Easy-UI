# Move files into the flatter folders
mkdir -p server/src/main/java/easy/util
git mv server/src/main/java/dev/yourname/jmri/easy/util/JsonUtil.java server/src/main/java/easy/util/JsonUtil.java
git mv server/src/main/java/dev/yourname/jmri/easy/util/RosterUtil.java server/src/main/java/easy/util/RosterUtil.java
git mv server/src/main/java/dev/yourname/jmri/easy/RosterApiServlet.java server/src/main/java/easy/RosterApiServlet.java
# (add these if present)
[ -f server/src/main/java/dev/yourname/jmri/easy/ConnectionsApiServlet.java ] && \
  git mv server/src/main/java/dev/yourname/jmri/easy/ConnectionsApiServlet.java server/src/main/java/easy/ConnectionsApiServlet.java
[ -f server/src/main/java/dev/yourname/jmri/easy/EasyUIMountServlet.java ] && \
  git mv server/src/main/java/dev/yourname/jmri/easy/EasyUIMountServlet.java server/src/main/java/easy/EasyUIMountServlet.java

# Update package lines (servlets)
LC_ALL=C find server/src/main/java/easy -maxdepth 1 -type f -name "*.java" \
  -exec sed -i.bak 's/^package[[:space:]]\+dev\.yourname\.jmri\.easy[[:space:]]*;/package easy;/' {} +

# Update package lines (utils)
LC_ALL=C find server/src/main/java/easy/util -type f -name "*.java" \
  -exec sed -i.bak 's/^package[[:space:]]\+dev\.yourname\.jmri\.easy\.util[[:space:]]*;/package easy.util;/' {} +

# Update imports that referenced the old util package
LC_ALL=C find server/src/main/java -type f -name "*.java" \
  -exec sed -i.bak 's/import[[:space:]]\+dev\.yourname\.jmri\.easy\.util\./import easy.util./g' {} +

# Clean up backup files
find server/src/main/java -type f -name "*.bak" -delete
