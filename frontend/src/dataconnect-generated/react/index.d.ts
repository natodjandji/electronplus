import { CreateUserData, CreateUserVariables, CreateProductData, CreateProductVariables, AddToCartData, AddToCartVariables, GetMyCartData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useCreateUser(options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, CreateUserVariables>): UseDataConnectMutationResult<CreateUserData, CreateUserVariables>;
export function useCreateUser(dc: DataConnect, options?: useDataConnectMutationOptions<CreateUserData, FirebaseError, CreateUserVariables>): UseDataConnectMutationResult<CreateUserData, CreateUserVariables>;

export function useCreateProduct(options?: useDataConnectMutationOptions<CreateProductData, FirebaseError, CreateProductVariables>): UseDataConnectMutationResult<CreateProductData, CreateProductVariables>;
export function useCreateProduct(dc: DataConnect, options?: useDataConnectMutationOptions<CreateProductData, FirebaseError, CreateProductVariables>): UseDataConnectMutationResult<CreateProductData, CreateProductVariables>;

export function useAddToCart(options?: useDataConnectMutationOptions<AddToCartData, FirebaseError, AddToCartVariables>): UseDataConnectMutationResult<AddToCartData, AddToCartVariables>;
export function useAddToCart(dc: DataConnect, options?: useDataConnectMutationOptions<AddToCartData, FirebaseError, AddToCartVariables>): UseDataConnectMutationResult<AddToCartData, AddToCartVariables>;

export function useGetMyCart(options?: useDataConnectQueryOptions<GetMyCartData>): UseDataConnectQueryResult<GetMyCartData, undefined>;
export function useGetMyCart(dc: DataConnect, options?: useDataConnectQueryOptions<GetMyCartData>): UseDataConnectQueryResult<GetMyCartData, undefined>;
