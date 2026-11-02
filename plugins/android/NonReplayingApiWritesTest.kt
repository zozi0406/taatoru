package app.taatoru.network

import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.Assert.*
import org.junit.Test

class NonReplayingApiWritesTest {
  private val payload = "{\"meaning_note\":\"invented もな\"}"
  private fun client(protected: Boolean = true): OkHttpClient {
    val builder = OkHttpClient.Builder().readTimeout(2, TimeUnit.SECONDS)
    if (!protected) return builder.build()
    NonReplayingApiWrites.installFactory { builder.build() }
    return try { OkHttpClientProvider.createClient() }
    finally { OkHttpClientProvider.setOkHttpClientFactory(null) }
  }
  private fun write(server: MockWebServer, path: String = "/v2/reviews", method: String = "POST", revision: Boolean = true): Request {
    val builder = Request.Builder().url(server.url(path))
      .method(method, payload.toRequestBody("application/json; charset=utf-8".toMediaType()))
    if (revision) builder.header("Wanikani-Revision", "20170710")
    return builder.build()
  }

  @Test fun acceptedBodyIsNotRetransmittedAfterConnectionLoss() {
    for (path in listOf("/v2/reviews", "/v2/study_materials")) {
      MockWebServer().use { server ->
        val client = client()
        server.enqueue(MockResponse().setBody("warm"))
        client.newCall(Request.Builder().url(server.url("/warm")).build()).execute().close()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        server.enqueue(MockResponse().setBody("unexpected replay"))
        try { client.newCall(write(server, path)).execute().use { fail("Mutation was transparently retried") } }
        catch (_: IOException) { /* The queue must now reconcile the uncertain result. */ }
        assertEquals(2, server.requestCount)
        server.takeRequest()
        assertEquals(payload, server.takeRequest().body.readUtf8())
      }
    }
  }

  @Test fun defaultClientControlDemonstratesTheConnectionReplay() {
    MockWebServer().use { server ->
      val client = client(false)
      server.enqueue(MockResponse().setBody("warm"))
      client.newCall(Request.Builder().url(server.url("/warm")).build()).execute().close()
      server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
      server.enqueue(MockResponse().setBody("replayed"))
      client.newCall(write(server)).execute().use { assertEquals(200, it.code) }
      assertEquals(3, server.requestCount)
    }
  }

  @Test fun readConnectionRecoveryAndExistingConfigurationArePreserved() {
    MockWebServer().use { server ->
      val cookies = object : okhttp3.CookieJar {
        override fun loadForRequest(url: okhttp3.HttpUrl) = emptyList<okhttp3.Cookie>()
        override fun saveFromResponse(url: okhttp3.HttpUrl, cookies: List<okhttp3.Cookie>) {}
      }
      val builder = OkHttpClient.Builder().readTimeout(2, TimeUnit.SECONDS)
        .connectTimeout(7, TimeUnit.SECONDS).cookieJar(cookies)
      var observed = 0
      builder.addInterceptor { chain -> observed++; chain.proceed(chain.request()) }
      NonReplayingApiWrites.configure(builder)
      NonReplayingApiWrites.configure(builder)
      NonReplayingApiWrites.installFactory { builder.build() }
      val client = try { OkHttpClientProvider.createClient() }
        finally { OkHttpClientProvider.setOkHttpClientFactory(null) }
      assertEquals(2, client.interceptors.size)
      assertEquals(2_000, client.readTimeoutMillis)
      assertEquals(7_000, client.connectTimeoutMillis)
      assertSame(cookies, client.cookieJar)
      server.enqueue(MockResponse().setBody("warm"))
      client.newCall(Request.Builder().url(server.url("/warm")).build()).execute().close()
      server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
      server.enqueue(MockResponse().setBody("recovered"))
      client.newCall(Request.Builder().url(server.url("/v2/user")).build()).execute().use {
        assertEquals("recovered", it.body!!.string())
      }
      assertEquals(3, server.requestCount)
      assertEquals(2, observed)
    }
  }

  @Test fun mutationFollowUpsDoNotResendBodies() {
    for (status in listOf(408, 503, 307, 308)) {
      MockWebServer().use { server ->
        server.enqueue(MockResponse().setResponseCode(status).setHeader("Retry-After", "0").setHeader("Location", server.url("/v2/reviews")))
        server.enqueue(MockResponse().setBody("unexpected replay"))
        client().newCall(write(server)).execute().use { assertEquals(status, it.code) }
        assertEquals(1, server.requestCount)
      }
    }
  }

  @Test fun matchingPreservesBytesMetadataAndUnrelatedRequests() {
    val cases = listOf(Triple("POST", "/v2/reviews", true), Triple("POST", "/v2/study_materials", true),
      Triple("PUT", "/v2/study_materials/123", true), Triple("PUT", "/v2/assignments/42/start", true),
      Triple("POST", "/other", false), Triple("PUT", "/v2/assignments/42", false))
    MockWebServer().use { server ->
      val bodies = mutableListOf<Boolean>()
      val builder = OkHttpClient.Builder()
      NonReplayingApiWrites.configure(builder)
      builder.addInterceptor(Interceptor { chain ->
        bodies.add(chain.request().body?.isOneShot() ?: false)
        chain.proceed(chain.request())
      })
      val client = builder.build()
      for ((method, path, expected) in cases) {
        server.enqueue(MockResponse().setBody("ok"))
        client.newCall(write(server, path, method)).execute().close()
        val received = server.takeRequest()
        assertEquals(payload, received.body.readUtf8())
        assertEquals(payload.toByteArray(Charsets.UTF_8).size.toString(), received.getHeader("Content-Length"))
        assertEquals("application/json; charset=utf-8", received.getHeader("Content-Type"))
        assertEquals(expected, bodies.last())
      }
      server.enqueue(MockResponse().setBody("ok"))
      client.newCall(write(server, revision = false)).execute().close()
      assertFalse(bodies.last())
      server.enqueue(MockResponse().setBody("ok"))
      client.newCall(Request.Builder().url(server.url("/v2/user")).build()).execute().close()
      assertFalse(bodies.last())
    }
  }
}
