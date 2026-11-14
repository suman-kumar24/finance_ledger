package expo.modules.ledgersms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val EVENT_SMS_RECEIVED = "onSmsReceived"
private const val MAX_LIMIT = 5000

class SmsPermissionException :
  CodedException("ERR_SMS_PERMISSION", "READ_SMS permission has not been granted", null)

class SmsUnsupportedException :
  CodedException("ERR_SMS_UNSUPPORTED", "This build does not include SMS reading", null)

/**
 * Reads SMS on demand and hands the messages to JavaScript, where bank
 * alerts are parsed and everything else is discarded. This module stores
 * nothing and makes no network calls.
 */
class LedgerSmsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var receiver: BroadcastReceiver? = null

  /** Whether the merged manifest of this build declares the permission at all. */
  private fun declares(permission: String): Boolean {
    return try {
      val pm = context.packageManager
      val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong())
        )
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
      }
      info.requestedPermissions?.contains(permission) == true
    } catch (e: Exception) {
      false
    }
  }

  private fun granted(permission: String): Boolean =
    ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun readInbox(sinceMs: Double, limit: Int): List<Bundle> {
    if (!declares(Manifest.permission.READ_SMS)) throw SmsUnsupportedException()
    if (!granted(Manifest.permission.READ_SMS)) throw SmsPermissionException()

    val max = limit.coerceIn(1, MAX_LIMIT)
    val out = ArrayList<Bundle>()
    val projection = arrayOf(
      Telephony.Sms.ADDRESS,
      Telephony.Sms.BODY,
      Telephony.Sms.DATE
    )
    context.contentResolver.query(
      Telephony.Sms.Inbox.CONTENT_URI,
      projection,
      "${Telephony.Sms.DATE} > ?",
      arrayOf(sinceMs.toLong().toString()),
      "${Telephony.Sms.DATE} DESC"
    )?.use { cursor ->
      val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
      val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
      val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
      while (cursor.moveToNext() && out.size < max) {
        val body = cursor.getString(bodyIndex) ?: continue
        out.add(
          Bundle().apply {
            putString("address", cursor.getString(addressIndex) ?: "")
            putString("body", body)
            putDouble("date", cursor.getLong(dateIndex).toDouble())
          }
        )
      }
    }
    return out
  }

  private fun startListening() {
    if (receiver != null) return
    if (!declares(Manifest.permission.RECEIVE_SMS) || !granted(Manifest.permission.RECEIVE_SMS)) return
    val created = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        if (messages.isEmpty()) return
        // A long SMS arrives in parts; join them into one message.
        val body = messages.joinToString(separator = "") { it.displayMessageBody ?: "" }
        val first = messages[0]
        try {
          sendEvent(
            EVENT_SMS_RECEIVED,
            Bundle().apply {
              putString("address", first.displayOriginatingAddress ?: "")
              putString("body", body)
              putDouble("date", first.timestampMillis.toDouble())
            }
          )
        } catch (e: Exception) {
          // The JS side has gone away; the next inbox scan will pick the message up.
        }
      }
    }
    val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
    // SMS_RECEIVED is sent by the system, which requires an exported receiver.
    ContextCompat.registerReceiver(context, created, filter, ContextCompat.RECEIVER_EXPORTED)
    receiver = created
  }

  private fun stopListening() {
    val current = receiver ?: return
    receiver = null
    try {
      appContext.reactContext?.unregisterReceiver(current)
    } catch (e: IllegalArgumentException) {
      // Already unregistered.
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LedgerSms")

    Events(EVENT_SMS_RECEIVED)

    Function("isSupported") {
      declares(Manifest.permission.READ_SMS)
    }

    Function("canListen") {
      declares(Manifest.permission.RECEIVE_SMS)
    }

    AsyncFunction("readInbox") { sinceMs: Double, limit: Int ->
      readInbox(sinceMs, limit)
    }

    Function("startListening") {
      startListening()
    }

    Function("stopListening") {
      stopListening()
    }

    OnDestroy {
      stopListening()
    }
  }
}
