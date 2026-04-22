package com.matender.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.matender.app.MainActivity
import com.matender.app.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MatenderWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    appWidgetIds.forEach { widgetId ->
      appWidgetManager.updateAppWidget(widgetId, buildRemoteViews(context))
    }
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    forceRefresh(context)
  }

  companion object {
    fun forceRefresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, MatenderWidgetProvider::class.java)
      val ids = manager.getAppWidgetIds(component)
      if (ids.isNotEmpty()) {
        ids.forEach { id -> manager.updateAppWidget(id, buildRemoteViews(context)) }
      }
    }

    private fun buildRemoteViews(context: Context): RemoteViews {
      val views = RemoteViews(context.packageName, R.layout.widget_matender)
      val format = SimpleDateFormat("M月d日(E)", Locale.JAPAN)
      views.setTextViewText(R.id.widgetTitle, context.getString(R.string.widget_title))
      views.setTextViewText(R.id.widgetDate, format.format(Date()))
      views.setTextViewText(R.id.widgetHint, context.getString(R.string.widget_hint))

      val intent = Intent(context, MainActivity::class.java)
      val pendingIntent = PendingIntent.getActivity(
        context,
        2001,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      views.setOnClickPendingIntent(R.id.widgetRoot, pendingIntent)
      return views
    }
  }
}
