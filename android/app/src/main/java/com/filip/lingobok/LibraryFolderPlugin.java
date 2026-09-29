package com.filip.lingobok;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.Locale;

@CapacitorPlugin(name = "LibraryFolder")
public class LibraryFolderPlugin extends Plugin {

    private static final String PREFS = "lingobok";
    private static final String LIBRARY_URI = "library_uri";

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                        | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "folderSelected");
    }

    @ActivityCallback
    private void folderSelected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("No folder selected");
            return;
        }

        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (SecurityException exception) {
            call.reject("Could not keep access to folder", exception);
            return;
        }

        getContext().getSharedPreferences(PREFS, 0)
                .edit()
                .putString(LIBRARY_URI, uri.toString())
                .apply();

        JSObject resultObject = new JSObject();
        resultObject.put("uri", uri.toString());
        call.resolve(resultObject);
    }

    @PluginMethod
    public void listBooks(PluginCall call) {
        String uriString = getContext().getSharedPreferences(PREFS, 0)
                .getString(LIBRARY_URI, null);
        if (uriString == null) {
            call.reject("No library folder selected");
            return;
        }

        Uri treeUri = Uri.parse(uriString);
        try {
            String parentDocumentId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
                    treeUri,
                    parentDocumentId);
            String[] projection = {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED
            };
            JSArray books = new JSArray();

            try (Cursor cursor = getContext().getContentResolver().query(
                    childrenUri,
                    projection,
                    null,
                    null,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME + " ASC")) {
                if (cursor == null) {
                    call.reject("Could not read library folder");
                    return;
                }

                int idColumn = cursor.getColumnIndexOrThrow(
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID);
                int nameColumn = cursor.getColumnIndexOrThrow(
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                int mimeColumn = cursor.getColumnIndexOrThrow(
                        DocumentsContract.Document.COLUMN_MIME_TYPE);
                int sizeColumn = cursor.getColumnIndexOrThrow(
                        DocumentsContract.Document.COLUMN_SIZE);
                int modifiedColumn = cursor.getColumnIndexOrThrow(
                        DocumentsContract.Document.COLUMN_LAST_MODIFIED);

                while (cursor.moveToNext()) {
                    String name = cursor.getString(nameColumn);
                    String mime = cursor.getString(mimeColumn);
                    if (name == null
                            || !name.toLowerCase(Locale.ROOT).endsWith(".epub")
                            || DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                        continue;
                    }

                    Uri documentUri = DocumentsContract.buildDocumentUriUsingTree(
                            treeUri,
                            cursor.getString(idColumn));
                    JSObject book = new JSObject();
                    book.put("uri", documentUri.toString());
                    book.put("name", name);
                    book.put("size", cursor.isNull(sizeColumn) ? 0 : cursor.getLong(sizeColumn));
                    book.put("modified", cursor.isNull(modifiedColumn) ? 0 : cursor.getLong(modifiedColumn));
                    books.put(book);
                }
            }

            JSObject result = new JSObject();
            result.put("books", books);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Could not scan library", exception);
        }
    }

    @PluginMethod
    public void materializeBook(PluginCall call) {
        String uriString = call.getString("uri");
        String name = call.getString("name");
        if (uriString == null || name == null) {
            call.reject("uri and name are required");
            return;
        }

        String safeName = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        File target = new File(
                getContext().getCacheDir(),
                Integer.toHexString(uriString.hashCode()) + "-" + safeName);

        try (
                InputStream input = getContext().getContentResolver().openInputStream(Uri.parse(uriString));
                FileOutputStream output = new FileOutputStream(target)) {
            if (input == null) {
                call.reject("Could not open EPUB");
                return;
            }

            byte[] buffer = new byte[8192];
            int length;
            while ((length = input.read(buffer)) != -1) {
                output.write(buffer, 0, length);
            }

            JSObject result = new JSObject();
            result.put("path", Uri.fromFile(target).toString());
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Could not read EPUB", exception);
        }
    }
}
