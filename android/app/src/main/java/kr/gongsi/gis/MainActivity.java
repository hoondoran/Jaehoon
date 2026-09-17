package kr.gongsi.gis;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;

/**
 * 공시지가 산정 GIS — 안드로이드 래퍼
 *
 * 배포된 PWA 를 WebView 로 띄운다. 오프라인 동작은 페이지의 서비스워커가 담당하므로
 * 여기서는 서비스워커를 켜 주고, 뒤로가기·위치권한·파일 내려받기만 앱 쪽에서 처리한다.
 *
 * 원격 URL 을 쓰는 이유: 카카오 지도 SDK 는 등록된 도메인에서만 동작한다.
 * assets 에 넣어 file:// 로 열면 SDK 가 거부하므로 등록된 https 주소를 그대로 연다.
 */
public class MainActivity extends Activity {

    private static final String APP_URL  = "https://hoondoran.github.io/Jaehoon/";
    private static final String APP_HOST = "hoondoran.github.io";
    private static final int REQ_LOCATION = 1001;

    private WebView web;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);          // localStorage — 좌표 캐시·메모
        ws.setDatabaseEnabled(true);
        ws.setGeolocationEnabled(true);         // 현장에서 현재 위치
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setCacheMode(WebSettings.LOAD_DEFAULT);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        // 서비스워커 활성화 — 오프라인 표시는 전적으로 여기에 달려 있다
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            ServiceWorkerController.getInstance()
                    .setServiceWorkerClient(new ServiceWorkerClient());
        }

        web.addJavascriptInterface(new FileBridge(), "AndroidFile");

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                                                           GeolocationPermissions.Callback cb) {
                cb.invoke(origin, true, false);
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost();
                if (host != null && host.equals(APP_HOST)) return false;   // 앱 안에서 처리
                openExternally(u);                                          // 그 외는 기본 브라우저
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    toast("오프라인입니다 — 저장된 자료로 표시합니다");
                }
            }
        });

        // 통계·검수 CSV 내려받기 (Blob URL)
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String disposition,
                                        String mime, long size) {
                if (url.startsWith("blob:")) {
                    web.evaluateJavascript(blobToBridgeJs(url, mime), null);
                } else {
                    openExternally(Uri.parse(url));
                }
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(APP_URL);

        requestLocationIfNeeded();
    }

    /* ---------- Blob 내려받기 ----------
       WebView 의 DownloadListener 는 blob: 을 처리하지 못한다.
       페이지 안에서 blob 을 base64 로 읽어 앱으로 넘긴 뒤 파일로 쓴다. */

    private static String blobToBridgeJs(String blobUrl, String mime) {
        return "(function(){"
             + "var x=new XMLHttpRequest();"
             + "x.open('GET','" + blobUrl + "',true);"
             + "x.responseType='blob';"
             + "x.onload=function(){"
             + "  var r=new FileReader();"
             + "  r.onloadend=function(){"
             + "    AndroidFile.save(r.result,'" + mime + "');"
             + "  };"
             + "  r.readAsDataURL(x.response);"
             + "};"
             + "x.send();"
             + "})();";
    }

    private class FileBridge {
        /** dataUrl 예: data:text/csv;charset=utf-8;base64,AAAA... */
        @JavascriptInterface
        public void save(String dataUrl, String mime) {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) return;
                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);

                String ext = (mime != null && mime.contains("csv")) ? "csv"
                           : (mime != null && mime.contains("javascript")) ? "js" : "txt";
                String name = "공시지가_" + System.currentTimeMillis() + "." + ext;

                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir != null && !dir.exists() && !dir.mkdirs()) dir = getFilesDir();
                if (dir == null) dir = getFilesDir();
                File out = new File(dir, name);

                FileOutputStream fos = new FileOutputStream(out);
                fos.write(bytes);
                fos.close();

                final String path = out.getAbsolutePath();
                runOnUiThread(new Runnable() {
                    @Override public void run() { toast("저장됨: " + path); }
                });
            } catch (Exception e) {
                runOnUiThread(new Runnable() {
                    @Override public void run() { toast("저장 실패"); }
                });
            }
        }
    }

    /* ---------- 보조 ---------- */

    private void openExternally(Uri u) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (ActivityNotFoundException e) {
            toast("열 수 있는 앱이 없습니다");
        }
    }

    private void toast(String s) {
        Toast.makeText(this, s, Toast.LENGTH_SHORT).show();
    }

    private void requestLocationIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("AndroidFile");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
