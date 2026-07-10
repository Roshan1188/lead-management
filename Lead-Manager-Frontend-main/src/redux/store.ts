/* eslint-disable no-undef */
import { configureStore } from '@reduxjs/toolkit';
import apiSlice from './apiSlice';

// You can add more API slices to this array in future
const apiMiddlewares = [apiSlice.middleware];
const apiReducers = {
  [apiSlice.reducerPath]: apiSlice.reducer,
};

const store = configureStore({
  reducer: {
    ...apiReducers,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable actions from RTK Query
        ignoredActions: [
          'persist/PERSIST',
          ...apiMiddlewares.map(
            // Ignore all relevant RTK Query actions
            (mw) => mw.reducerPath && `${mw.reducerPath}/executeQuery/pending`
          ),
        ],
        ignoredPaths: ['api.queries', 'api.mutations'],
      },
    }).concat(...apiMiddlewares),
  devTools: process.env.NODE_ENV !== 'production',
  // For testing: pass initialState as second arg when needed
  // preloadedState: {},
});

export default store;