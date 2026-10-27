import React, {
  createContext, useContext, useEffect, useMemo, useState,
} from 'react';
import PropTypes from 'prop-types';

import { matchPath, useLocation } from 'react-router-dom';

import {
  getLocale, getMessages, handleRtl, IntlProvider, isRtl,
} from '@edx/frontend-platform/i18n';
import { logError } from '@edx/frontend-platform/logging';

import { getCourseLanguage, sendCourseLanguageToLms } from './api';

/**
 * Renders the Discussions MFE in the language configured for the course in Studio
 * (Advanced Settings > Course Language), instead of the learner's account language.
 * Same behaviour as the Learning MFE's src/course-locale.
 *
 * The override is scoped to this page: a nested IntlProvider replaces the one from
 * AppProvider, and <html lang/dir> follow it. The shared language-preference cookie
 * is never touched, so the dashboard and the other MFEs keep the account language.
 *
 * When embedded as the Learning MFE's in-context sidebar, the Learning MFE passes the
 * language it is showing in the `locale` query parameter, and the sidebar follows it.
 *
 * If the learner picks a language from the header, the header saves it as their account
 * language and reloads; that choice is shown for the rest of this visit only (until the
 * next full page load), so opening the course again uses the course language.
 */

const COURSE_PATH = '/:courseId/*';
const COURSE_LANGUAGE_CACHE_KEY = 'rowad-course-language';
// sessionStorage, read once on the page load that follows the header's language switch.
const LEARNER_CHOICE_KEY = 'rowad-course-language-choice';

const CourseLocaleContext = createContext({});

export const useCourseLocale = () => useContext(CourseLocaleContext);

const readStorage = (storage, key) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (storage, key, value) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the override still applies for this page view.
  }
};

const readLearnerChoice = () => {
  try {
    return JSON.parse(readStorage(window.sessionStorage, LEARNER_CHOICE_KEY)) || null;
  } catch {
    return null;
  }
};

// Read once: navigation inside the sidebar doesn't keep the query parameter.
const readHostLocale = () => {
  const params = new URLSearchParams(window.location.search);
  return params.has('inContextSidebar') ? params.get('locale') : null;
};

const CourseLocaleProvider = ({ children }) => {
  const { pathname } = useLocation();
  const courseId = matchPath({ path: COURSE_PATH }, pathname)?.params.courseId || null;
  const cacheKey = `${COURSE_LANGUAGE_CACHE_KEY}:${courseId}`;

  const [hostLocale] = useState(readHostLocale);
  // { courseId, language } picked from the header just before this page load, if any.
  const [learnerChoice] = useState(readLearnerChoice);
  useEffect(() => {
    try {
      window.sessionStorage.removeItem(LEARNER_CHOICE_KEY);
    } catch {
      // Nothing to clean up when storage is unavailable.
    }
  }, []);

  // `undefined` means "not resolved yet", `null` means "no course language to apply".
  const [courseLanguage, setCourseLanguage] = useState(
    () => (courseId && !hostLocale ? readStorage(window.sessionStorage, cacheKey) || undefined : null),
  );

  useEffect(() => {
    if (!courseId || hostLocale) {
      setCourseLanguage(null);
      return undefined;
    }

    let isMounted = true;
    setCourseLanguage(readStorage(window.sessionStorage, cacheKey) || undefined);
    getCourseLanguage(courseId)
      .then((language) => {
        if (isMounted) {
          writeStorage(window.sessionStorage, cacheKey, language);
          setCourseLanguage(language);
        }
      })
      .catch((error) => {
        logError(error);
        if (isMounted) {
          setCourseLanguage(current => current || null);
        }
      });
    return () => { isMounted = false; };
  }, [courseId, cacheKey, hostLocale]);

  const accountLocale = getLocale();
  const choiceForCourse = learnerChoice && learnerChoice.courseId === courseId ? learnerChoice.language : null;
  const requestedLanguage = courseId && (hostLocale || choiceForCourse || courseLanguage);
  const courseLocale = requestedLanguage ? getLocale(requestedLanguage) : null;
  const languageOverride = courseLocale && courseLocale !== accountLocale ? courseLocale : undefined;

  // On course pages, always tell the LMS which language the page shows: without the header
  // it answers course requests in the course language, which is wrong after a learner's switch.
  // Set during render (not in an effect) so it is in place before the children's
  // effects make their first API calls; effects run child-first.
  sendCourseLanguageToLms(courseId ? languageOverride || accountLocale : undefined);

  useEffect(() => {
    if (!languageOverride) {
      return undefined;
    }
    const html = document.documentElement;
    html.setAttribute('lang', languageOverride);
    html.setAttribute('dir', isRtl(languageOverride) ? 'rtl' : 'ltr');
    return () => {
      html.setAttribute('lang', getLocale());
      handleRtl();
    };
  }, [languageOverride]);

  const contextValue = useMemo(() => ({
    languageOverride,
    onLanguageChange: courseId
      ? (language) => writeStorage(window.sessionStorage, LEARNER_CHOICE_KEY, JSON.stringify({ courseId, language }))
      : undefined,
  }), [languageOverride, courseId]);

  // Hold the first paint of a course page until its language is known, so the page
  // doesn't render in the account language and then flip direction.
  if (courseLanguage === undefined) {
    return null;
  }

  const locale = languageOverride || accountLocale;
  return (
    <IntlProvider locale={locale} messages={getMessages(locale)}>
      <CourseLocaleContext.Provider value={contextValue}>
        {children}
      </CourseLocaleContext.Provider>
    </IntlProvider>
  );
};

CourseLocaleProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default CourseLocaleProvider;
