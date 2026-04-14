#!/bin/bash
# Build AppImage using docker (wrapped for consistency)
# This script centralizes AppImage build command management

set -e

BUILD_IMAGE_NAME="${1:-void-appimage-builder}"
WORKSPACE_DIR="${2:-.}"

echo "Building AppImage..."
echo "Image: $BUILD_IMAGE_NAME"
echo "Workspace: $WORKSPACE_DIR"
echo ""

# Run the container with the same privileges and volumes
cd "$WORKSPACE_DIR"

docker run --rm --privileged -v "$(pwd):/app" "$BUILD_IMAGE_NAME" bash -c '
cd /app && \
rm -rf VoidApp.AppDir && \
mkdir -p VoidApp.AppDir/usr/bin VoidApp.AppDir/usr/lib VoidApp.AppDir/usr/share/applications && \
find . -maxdepth 1 ! -name VoidApp.AppDir ! -name "." ! -name ".." -exec cp -r {} VoidApp.AppDir/usr/bin/ \; && \
cp void.png VoidApp.AppDir/ && \
echo "[Desktop Entry]" > VoidApp.AppDir/void.desktop && \
echo "Name=Void" >> VoidApp.AppDir/void.desktop && \
echo "Comment=Open source AI code editor." >> VoidApp.AppDir/void.desktop && \
echo "GenericName=Text Editor" >> VoidApp.AppDir/void.desktop && \
echo "Exec=void %F" >> VoidApp.AppDir/void.desktop && \
echo "Icon=void" >> VoidApp.AppDir/void.desktop && \
echo "Type=Application" >> VoidApp.AppDir/void.desktop && \
echo "StartupNotify=false" >> VoidApp.AppDir/void.desktop && \
echo "StartupWMClass=Void" >> VoidApp.AppDir/void.desktop && \
echo "Categories=TextEditor;Development;IDE;" >> VoidApp.AppDir/void.desktop && \
echo "MimeType=application/x-void-workspace;" >> VoidApp.AppDir/void.desktop && \
echo "Keywords=void;" >> VoidApp.AppDir/void.desktop && \
echo "Actions=new-empty-window;" >> VoidApp.AppDir/void.desktop && \
echo "[Desktop Action new-empty-window]" >> VoidApp.AppDir/void.desktop && \
echo "Name=New Empty Window" >> VoidApp.AppDir/void.desktop && \
echo "Name[de]=Neues leeres Fenster" >> VoidApp.AppDir/void.desktop && \
echo "Name[es]=Nueva ventana vacía" >> VoidApp.AppDir/void.desktop && \
echo "Name[fr]=Nouvelle fenêtre vide" >> VoidApp.AppDir/void.desktop && \
echo "Name[it]=Nuova finestra vuota" >> VoidApp.AppDir/void.desktop && \
echo "Name[ja]=新しい空のウィンドウ" >> VoidApp.AppDir/void.desktop && \
echo "Name[ko]=새 빈 창" >> VoidApp.AppDir/void.desktop && \
echo "Name[ru]=Новое пустое окно" >> VoidApp.AppDir/void.desktop && \
echo "Name[zh_CN]=新建空窗口" >> VoidApp.AppDir/void.desktop && \
echo "Name[zh_TW]=開新空視窗" >> VoidApp.AppDir/void.desktop && \
echo "Exec=void --new-window %F" >> VoidApp.AppDir/void.desktop && \
echo "Icon=void" >> VoidApp.AppDir/void.desktop && \
chmod +x VoidApp.AppDir/void.desktop && \
cp VoidApp.AppDir/void.desktop VoidApp.AppDir/usr/share/applications/ && \
echo "[Desktop Entry]" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Name=Void - URL Handler" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Comment=Open source AI code editor." > VoidApp.AppDir/void-url-handler.desktop && \
echo "GenericName=Text Editor" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Exec=void --open-url %U" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Icon=void" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Type=Application" > VoidApp.AppDir/void-url-handler.desktop && \
echo "NoDisplay=true" > VoidApp.AppDir/void-url-handler.desktop && \
echo "StartupNotify=true" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Categories=Utility;TextEditor;Development;IDE;" > VoidApp.AppDir/void-url-handler.desktop && \
echo "MimeType=x-scheme-handler/void;" > VoidApp.AppDir/void-url-handler.desktop && \
echo "Keywords=void;" > VoidApp.AppDir/void-url-handler.desktop && \
chmod +x VoidApp.AppDir/void-url-handler.desktop && \
cp VoidApp.AppDir/void-url-handler.desktop VoidApp.AppDir/usr/share/applications/ && \
echo "#!/bin/bash" > VoidApp.AppDir/AppRun && \
echo "HERE=\$(dirname \"\$(readlink -f \"\${0}\")\")" >> VoidApp.AppDir/AppRun && \
echo "export PATH=\${HERE}/usr/bin:\${PATH}" >> VoidApp.AppDir/AppRun && \
echo "export LD_LIBRARY_PATH=\${HERE}/usr/lib:\${LD_LIBRARY_PATH}" >> VoidApp.AppDir/AppRun && \
echo "exec \${HERE}/usr/bin/void --no-sandbox \"\$@\"" >> VoidApp.AppDir/AppRun && \
chmod +x VoidApp.AppDir/AppRun && \
chmod -R 755 VoidApp.AppDir && \
strip --strip-unneeded VoidApp.AppDir/usr/bin/void && \
ls -la VoidApp.AppDir/ && \
ARCH=x86_64 ./appimagetool -n VoidApp.AppDir Void-x86_64.AppImage
'
