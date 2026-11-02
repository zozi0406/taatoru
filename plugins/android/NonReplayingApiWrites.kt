package app.taatoru.network

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okio.BufferedSink

/** Queue reconciliation owns API mutation retries, including lost responses. */
object NonReplayingApiWrites {
  fun install(context: Context) {
    val appContext = context.applicationContext
    installFactory { OkHttpClientProvider.createClientBuilder(appContext).build() }
  }

  internal fun installFactory(factory: OkHttpClientFactory) {
    // Expo Fetch and RN networking both obtain clients through this factory.
    OkHttpClientProvider.setOkHttpClientFactory {
      factory.createNewNetworkModuleClient().newBuilder().apply { configure(this) }.build()
    }
  }

  internal fun configure(builder: OkHttpClient.Builder) {
    if (builder.interceptors().none { it === oneShotWrites }) builder.addInterceptor(oneShotWrites)
  }

  private val oneShotWrites = Interceptor { chain ->
    val request = chain.request()
    val body = request.body
    val path = request.url.encodedPath
    val mutation = when (request.method) {
      "POST" -> path == "/v2/reviews" || path == "/v2/study_materials"
      "PUT" -> Regex("/v2/(study_materials/[0-9]+|assignments/[0-9]+/start)").matches(path)
      else -> false
    }
    if (body == null || body.isOneShot() || !mutation || request.header("Wanikani-Revision") != "20170710") {
      chain.proceed(request)
    } else {
      // Application interceptors precede OkHttp's retry/follow-up interceptor.
      chain.proceed(request.newBuilder().method(request.method, OneShotBody(body)).build())
    }
  }

  private class OneShotBody(private val delegate: RequestBody) : RequestBody() {
    override fun contentType() = delegate.contentType()
    override fun contentLength() = delegate.contentLength()
    override fun isDuplex() = delegate.isDuplex()
    override fun isOneShot() = true
    override fun writeTo(sink: BufferedSink) = delegate.writeTo(sink)
  }
}
