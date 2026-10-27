import { getConfig } from '@edx/frontend-platform';
import { getAuthenticatedHttpClient } from '@edx/frontend-platform/auth';

// Read by the Rowad `extra_info` plugin (customized-plugins/extra_info/middleware.py), which
// activates this language for the request so LMS-translated strings match the page.
const COURSE_LANGUAGE_HEADER = 'X-Rowad-Course-Language';

let courseLanguageForLms;
let isInterceptorInstalled = false;

// Served by the Rowad `extra_info` plugin (customized-plugins/extra_info/views.py::get_course_language).
// Returns the Studio "Course Language" advanced setting, defaulting to "en".
export async function getCourseLanguage(courseId) {
  const url = `${getConfig().LMS_BASE_URL}/get/course/language/${courseId}/`;
  const { data } = await getAuthenticatedHttpClient().get(url, { timeout: 10000 });
  return data.language;
}

/**
 * Send `language` with every request to the LMS, or stop sending it when undefined.
 * Only LMS requests carry the header: other services don't allow it through CORS.
 */
export function sendCourseLanguageToLms(language) {
  courseLanguageForLms = language;
  if (isInterceptorInstalled) {
    return;
  }
  getAuthenticatedHttpClient().interceptors.request.use((requestConfig) => {
    if (courseLanguageForLms && String(requestConfig.url).startsWith(getConfig().LMS_BASE_URL)) {
      requestConfig.headers[COURSE_LANGUAGE_HEADER] = courseLanguageForLms; // eslint-disable-line no-param-reassign
    }
    return requestConfig;
  });
  isInterceptorInstalled = true;
}
