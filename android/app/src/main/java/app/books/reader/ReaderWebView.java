package app.books.reader;

import android.content.Context;
import android.graphics.Rect;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.WebView;
import java.util.function.BooleanSupplier;

/** Keep Android selection handles while Books supplies the reader action bar. */
final class ReaderWebView extends WebView {
    private final BooleanSupplier reading;

    ReaderWebView(Context context, BooleanSupplier reading) {
        super(context);
        this.reading = reading;
        // Keep native focus in touch mode so the first D-pad press reaches the
        // reader instead of being consumed by Android to acquire focus.
        setFocusableInTouchMode(true);
    }

    private boolean readerSelection() {
        HitTestResult hit = getHitTestResult();
        return reading.getAsBoolean() && hit != null && hit.getType() != HitTestResult.EDIT_TEXT_TYPE;
    }

    @Override public ActionMode startActionMode(ActionMode.Callback callback) {
        return startActionMode(callback, ActionMode.TYPE_PRIMARY);
    }

    @Override public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return super.startActionMode(new ActionMode.Callback2() {
            @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                boolean result = callback.onCreateActionMode(mode, menu);
                if (readerSelection()) menu.clear();
                return result;
            }
            @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                boolean result = callback.onPrepareActionMode(mode, menu);
                if (readerSelection()) menu.clear();
                return result;
            }
            @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                return callback.onActionItemClicked(mode, item);
            }
            @Override public void onDestroyActionMode(ActionMode mode) {
                callback.onDestroyActionMode(mode);
            }
            @Override public void onGetContentRect(ActionMode mode, View view, Rect out) {
                if (callback instanceof ActionMode.Callback2)
                    ((ActionMode.Callback2) callback).onGetContentRect(mode, view, out);
                else super.onGetContentRect(mode, view, out);
            }
        }, type);
    }
}
